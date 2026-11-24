//! HFS+ and HFSX structures and block addressing follow Apple TN1150.
use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, be16, be32, be64, bundle, check_range,
    decode::DecodeBudget, nested, pkg,
};
use std::collections::VecDeque;
use unicode_normalization::UnicodeNormalization;

const ROOT_ID: u32 = 2;
const EXTENTS_ID: u32 = 3;
const CATALOG_ID: u32 = 4;
const MAX_EXTENTS: usize = 4096;
const INVALID_NODE: ScanError = ScanError::Invalid("HFS B-tree node");

#[derive(Clone, Copy)]
struct Extent {
    start: u32,
    count: u32,
}

struct Fork {
    id: u32,
    size: u64,
    total_blocks: u32,
    known_blocks: u32,
    extents: Vec<Extent>,
}

impl Fork {
    fn parse(id: u32, bytes: &[u8], geometry: Geometry) -> Result<Self> {
        let mut fork = Self {
            id,
            size: be64(bytes, 0),
            total_blocks: be32(bytes, 12),
            known_blocks: 0,
            extents: Vec::new(),
        };
        if fork.size > fork.total_blocks as u64 * geometry.block_size {
            return Err(ScanError::Invalid("HFS fork logical size"));
        }
        fork.append(&bytes[16..80], geometry.blocks)?;
        Ok(fork)
    }

    fn append(&mut self, bytes: &[u8], blocks: u32) -> Result<()> {
        for record in bytes.as_chunks::<8>().0 {
            let start = be32(record, 0);
            let count = be32(record, 4);
            if count == 0 {
                break;
            }
            if self.extents.len() == MAX_EXTENTS {
                return Err(ScanError::Limit("HFS fork exceeds 4096 extents"));
            }
            if start >= blocks
                || count > blocks - start
                || count > self.total_blocks - self.known_blocks
            {
                return Err(ScanError::Invalid("HFS allocation extent"));
            }
            self.extents.push(Extent { start, count });
            self.known_blocks += count;
        }
        Ok(())
    }

    fn extent_at(&self, block: u32) -> Option<(u32, u32)> {
        let mut index = block;
        for extent in &self.extents {
            if index < extent.count {
                return Some((extent.start + index, extent.count - index));
            }
            index -= extent.count;
        }
        None
    }
}

#[derive(Clone, Copy)]
struct Geometry {
    block_size: u64,
    blocks: u32,
}

struct Volume<'a, S> {
    disk: &'a mut S,
    geometry: Geometry,
    overflow: Fork,
    overflow_tree: Option<Tree>,
}

#[derive(Clone, Copy)]
struct Tree {
    node_size: usize,
    root: u32,
    nodes: u32,
    case_sensitive: bool,
}

impl Tree {
    fn parse(header: &[u8], file_size: u64) -> Result<Self> {
        if header[8] != 1 {
            return Err(INVALID_NODE);
        }
        let node_size = be16(header, 32) as usize;
        let root = be32(header, 16);
        let nodes = be32(header, 36);
        if !(512..=32768).contains(&node_size)
            || !node_size.is_power_of_two()
            || root >= nodes
            || nodes as u64 * node_size as u64 > file_size
        {
            return Err(INVALID_NODE);
        }
        Ok(Self {
            node_size,
            root,
            nodes,
            case_sensitive: header[51] == 0xbc,
        })
    }

    fn node_offset(self, node: u32) -> Result<u64> {
        if node == 0 || node >= self.nodes {
            return Err(INVALID_NODE);
        }
        Ok(node as u64 * self.node_size as u64)
    }
}

struct ForkReader<'a, 'disk, S> {
    volume: &'a mut Volume<'disk, S>,
    fork: Fork,
}

impl<S: ReadAt> ReadAt for ForkReader<'_, '_, S> {
    fn size(&self) -> u64 {
        self.fork.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.volume.read_fork(&mut self.fork, offset, len).await
    }
}

impl<S: ReadAt> Volume<'_, S> {
    async fn read_fork(&mut self, fork: &mut Fork, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(fork.size, offset, len as u64)?;
        if len == 0 {
            return Ok(Vec::new());
        }
        while offset + len as u64 > fork.known_blocks as u64 * self.geometry.block_size {
            if fork.extents.len() == MAX_EXTENTS {
                return Err(ScanError::Limit("HFS fork exceeds 4096 extents"));
            }
            let before = fork.known_blocks;
            if before >= fork.total_blocks {
                return Err(ScanError::Invalid("HFS fork allocation ends early"));
            }
            let more = self.lookup_overflow(fork.id, before).await?;
            fork.append(&more, self.geometry.blocks)?;
            if before == fork.known_blocks {
                return Err(ScanError::Invalid("empty HFS overflow extent record"));
            }
        }
        read_known(self.disk, self.geometry, fork, offset, len).await
    }

    async fn lookup_overflow(&mut self, id: u32, block: u32) -> Result<[u8; 64]> {
        if self.overflow.size == 0 || id == EXTENTS_ID {
            return Err(ScanError::NotFound("HFS extents overflow record"));
        }
        let tree = if let Some(tree) = self.overflow_tree {
            tree
        } else {
            let header = read_known(self.disk, self.geometry, &self.overflow, 0, 52).await?;
            let tree = Tree::parse(&header, self.overflow.size)?;
            self.overflow_tree = Some(tree);
            tree
        };

        let mut current = tree.root;
        let target = (id, 0, block); // Data fork has forkType zero.
        for _ in 0..32 {
            if current == 0 {
                break;
            }
            let data = read_known(
                self.disk,
                self.geometry,
                &self.overflow,
                tree.node_offset(current)?,
                tree.node_size,
            )
            .await?;
            let node = Node::parse(&data)?;
            if node.leaf() {
                for record in node.records() {
                    let (key, value) = extent_record(record)?;
                    if key == target {
                        return value
                            .get(..64)
                            .ok_or(INVALID_NODE)?
                            .try_into()
                            .map_err(|_| INVALID_NODE);
                    }
                }
                break;
            }

            current = 0;
            for record in node.records() {
                let (key, value) = extent_record(record)?;
                if key > target {
                    break;
                }
                current = child(value)?;
            }
        }
        Err(ScanError::NotFound("HFS extents overflow record"))
    }
}

async fn read_known(
    disk: &mut impl ReadAt,
    geometry: Geometry,
    fork: &Fork,
    mut offset: u64,
    len: usize,
) -> Result<Vec<u8>> {
    check_range(fork.size, offset, len as u64)?;
    let mut bytes = Vec::with_capacity(len);
    while bytes.len() < len {
        let within = offset % geometry.block_size;
        let (block, available) = fork
            .extent_at((offset / geometry.block_size) as u32)
            .ok_or(ScanError::Unsupported(
                "HFS extents tree exceeds its initial allocation extents",
            ))?;
        let count = (available as u64 * geometry.block_size - within)
            .min((len - bytes.len()) as u64) as usize;
        let position = block as u64 * geometry.block_size + within;
        bytes.extend(disk.read_at(position, count).await?);
        offset += count as u64;
    }
    Ok(bytes)
}

struct Node<'a> {
    bytes: &'a [u8],
    offsets: Vec<usize>,
}

impl<'a> Node<'a> {
    fn parse(bytes: &'a [u8]) -> Result<Self> {
        let count = be16(bytes, 10) as usize;
        let table = bytes
            .len()
            .checked_sub((count + 1) * 2)
            .ok_or(INVALID_NODE)?;
        if table < 14 || !matches!(bytes[8], 0 | 0xff) {
            return Err(INVALID_NODE);
        }
        let offsets: Vec<_> = (0..=count)
            .map(|index| be16(bytes, bytes.len() - 2 * (index + 1)) as usize)
            .collect();
        if offsets[0] < 14 || offsets[count] > table || offsets.windows(2).any(|p| p[0] >= p[1]) {
            return Err(INVALID_NODE);
        }
        Ok(Self { bytes, offsets })
    }

    fn leaf(&self) -> bool {
        self.bytes[8] == 0xff
    }
    fn next(&self) -> u32 {
        be32(self.bytes, 0)
    }

    fn records(&self) -> impl Iterator<Item = &'a [u8]> + '_ {
        self.offsets
            .windows(2)
            .map(|pair| &self.bytes[pair[0]..pair[1]])
    }
}

type ExtentKey = (u32, u8, u32);

fn extent_record(record: &[u8]) -> Result<(ExtentKey, &[u8])> {
    if record.len() < 12 || be16(record, 0) != 10 {
        return Err(INVALID_NODE);
    }
    Ok(((be32(record, 4), record[2], be32(record, 8)), &record[12..]))
}

fn child(value: &[u8]) -> Result<u32> {
    if value.len() < 4 {
        return Err(INVALID_NODE);
    }
    Ok(be32(value, 0))
}

fn catalog_record(record: &[u8]) -> Result<(u32, &[u8], &[u8])> {
    if record.len() < 8 {
        return Err(INVALID_NODE);
    }
    let name_end = 8 + be16(record, 6) as usize * 2;
    if name_end > record.len() || name_end != 2 + be16(record, 0) as usize {
        return Err(INVALID_NODE);
    }
    Ok((be32(record, 2), &record[8..name_end], &record[name_end..]))
}

struct Catalog {
    fork: Fork,
    tree: Tree,
    cache: VecDeque<(u32, Vec<u8>)>,
}

struct Item {
    name: String,
    id: u32,
    file: Option<FileRecord>,
}

struct FileRecord {
    fork: [u8; 80],
    mode: u16,
    compressed: bool,
}

impl Catalog {
    async fn load(volume: &mut Volume<'_, impl ReadAt>, mut fork: Fork) -> Result<Self> {
        let header = volume.read_fork(&mut fork, 0, 52).await?;
        let tree = Tree::parse(&header, fork.size)?;
        Ok(Self {
            fork,
            tree,
            cache: VecDeque::new(),
        })
    }

    async fn node(&mut self, volume: &mut Volume<'_, impl ReadAt>, id: u32) -> Result<Node<'_>> {
        if let Some(index) = self.cache.iter().position(|(key, _)| *key == id) {
            let entry = self.cache.remove(index).unwrap();
            self.cache.push_front(entry);
        } else {
            let position = self.tree.node_offset(id)?;
            let data = volume
                .read_fork(&mut self.fork, position, self.tree.node_size)
                .await?;
            self.cache.push_front((id, data));
            self.cache.truncate(16);
        }
        Node::parse(&self.cache[0].1)
    }

    async fn children(
        &mut self,
        volume: &mut Volume<'_, impl ReadAt>,
        parent: u32,
    ) -> Result<Vec<Item>> {
        let mut current = self.tree.root;
        if current == 0 {
            return Ok(Vec::new());
        }

        // Descend just before the first key with the target parent; children
        // sharing the same parent ID can cross leaf boundaries.
        for _ in 0..32 {
            let node = self.node(volume, current).await?;
            if node.leaf() {
                break;
            }
            let mut next = None;
            for record in node.records() {
                let (key, _, value) = catalog_record(record)?;
                if key >= parent && next.is_some() {
                    break;
                }
                next = Some(child(value)?);
                if key >= parent {
                    break;
                }
            }
            current = next.ok_or(INVALID_NODE)?;
        }

        let mut items = Vec::new();
        for _ in 0..256 {
            let node = self.node(volume, current).await?;
            if !node.leaf() {
                return Err(INVALID_NODE);
            }
            for record in node.records() {
                let (id, name, data) = catalog_record(record)?;
                if id < parent {
                    continue;
                }
                if id > parent {
                    return Ok(items);
                }
                if data.len() < 2 {
                    return Err(INVALID_NODE);
                }
                let kind = be16(data, 0);
                if !matches!(kind, 1 | 2) {
                    continue;
                } // Thread records have no file or folder.
                if data.len() < 12 {
                    return Err(INVALID_NODE);
                }
                let utf16: Vec<_> = name
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|pair| u16::from_be_bytes(*pair))
                    .collect();
                let Ok(name) = String::from_utf16(&utf16) else {
                    continue;
                };
                let file = if kind == 2 {
                    let bytes = data.get(88..168).ok_or(INVALID_NODE)?;
                    Some(FileRecord {
                        fork: bytes.try_into().unwrap(),
                        mode: be16(data, 42),
                        compressed: data[41] & 0x20 != 0,
                    })
                } else {
                    None
                };
                if items.len() == 4096 {
                    return Err(ScanError::Limit("HFS folder exceeds 4096 catalog entries"));
                }
                items.push(Item {
                    name,
                    id: be32(data, 8),
                    file,
                });
            }
            let next = node.next();
            if next == 0 {
                return Ok(items);
            }
            if next == current {
                return Err(INVALID_NODE);
            }
            current = next;
        }
        Err(ScanError::Limit("HFS catalog lookup exceeds 256 leaves"))
    }

    async fn find(
        &mut self,
        volume: &mut Volume<'_, impl ReadAt>,
        parent: u32,
        name: &str,
        file: bool,
    ) -> Result<Item> {
        let items = self.children(volume, parent).await?;
        let normalized: String = name.nfd().collect();
        let select = |exact: bool| {
            items.iter().position(|item| {
                item.file.is_some() == file
                    && if exact {
                        item.name == name || item.name == normalized
                    } else {
                        item.name.eq_ignore_ascii_case(&normalized)
                            || item.name.to_lowercase() == normalized.to_lowercase()
                    }
            })
        };
        let index = select(true)
            .or_else(|| (!self.tree.case_sensitive).then(|| select(false)).flatten())
            .ok_or(ScanError::NotFound("bundle path in HFS catalog"))?;
        Ok(items.into_iter().nth(index).unwrap())
    }

    async fn find_path(
        &mut self,
        volume: &mut Volume<'_, impl ReadAt>,
        mut parent: u32,
        path: &str,
        file: bool,
    ) -> Result<Item> {
        let mut parts = path.trim_start_matches("./").split('/').peekable();
        while let Some(part) = parts.next() {
            if parts.peek().is_none() {
                return self.find(volume, parent, part, file).await;
            }
            parent = self.find(volume, parent, part, false).await?.id;
        }
        Err(ScanError::Invalid("empty HFS path"))
    }
}

fn file_fork(item: Item, geometry: Geometry) -> Result<Fork> {
    let file = item.file.ok_or(INVALID_NODE)?;
    if file.compressed {
        return Err(ScanError::Unsupported("HFS decmpfs-compressed file"));
    }
    if !matches!(file.mode & 0o170000, 0 | 0o100000) {
        return Err(ScanError::Unsupported(
            "HFS bundle file is a symlink or special file",
        ));
    }
    Fork::parse(item.id, &file.fork, geometry)
}

pub(crate) async fn scan(
    disk: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let header = disk.read_at(1024, 512).await?;
    if !matches!(&header[..4], b"H+\0\x04" | b"HX\0\x05") {
        return Err(ScanError::Invalid("HFS volume header signature or version"));
    }
    let geometry = Geometry {
        block_size: be32(&header, 40) as u64,
        blocks: be32(&header, 44),
    };
    if geometry.block_size < 512 || !geometry.block_size.is_power_of_two() || geometry.blocks == 0 {
        return Err(ScanError::Invalid("HFS allocation block geometry"));
    }
    check_range(disk.size(), 0, geometry.block_size * geometry.blocks as u64)?;

    let overflow = Fork::parse(EXTENTS_ID, &header[192..272], geometry)?;
    let catalog = Fork::parse(CATALOG_ID, &header[272..352], geometry)?;
    let mut volume = Volume {
        disk,
        geometry,
        overflow,
        overflow_tree: None,
    };
    let mut catalog = Catalog::load(&mut volume, catalog).await?;
    if let Target::Executable(path) = target {
        let item = catalog.find_path(&mut volume, ROOT_ID, path, true).await?;
        out.executable_path = Some(path.to_owned());
        let fork = file_fork(item, geometry)?;
        out.executable_size = Some(fork.size);
        return out
            .scan_macho(&mut ForkReader {
                volume: &mut volume,
                fork,
            })
            .await;
    }
    let mut root = None;
    let app = if let Target::Bundle(path) = target {
        match catalog.find_path(&mut volume, ROOT_ID, path, false).await {
            Ok(item) => Some((item.id, path.trim_start_matches("./").to_owned())),
            Err(ScanError::NotFound(_)) => None,
            Err(error) => return Err(error),
        }
    } else {
        let items = catalog.children(&mut volume, ROOT_ID).await?;
        let app = items
            .iter()
            .filter(|item| {
                item.file.is_none() && item.name.ends_with(".app") && !item.name.starts_with('.')
            })
            .min_by(|a, b| a.name.cmp(&b.name))
            .map(|item| (item.id, item.name.clone()));
        root = Some(items);
        app
    };
    let Some((app, app_path)) = app else {
        let items = match root {
            Some(items) => items,
            None => catalog.children(&mut volume, ROOT_ID).await?,
        };
        return read_package(&mut volume, &mut catalog, items, work, target, out).await;
    };
    out.bundle_path = Some(app_path.clone());

    let contents = catalog.find(&mut volume, app, "Contents", false).await?;
    let item = catalog
        .find(&mut volume, contents.id, "Info.plist", true)
        .await?;
    let mut info = file_fork(item, geometry)?;
    if info.size > bundle::MAX_PLIST {
        return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
    }
    let info_size = info.size as usize;
    let plist = volume.read_fork(&mut info, 0, info_size).await?;
    let path = bundle::apply_plist(&plist, &app_path, out)?;
    let relative = &path[app_path.len() + "/Contents/".len()..];
    let item = catalog
        .find_path(&mut volume, contents.id, relative, true)
        .await?;
    let fork = file_fork(item, geometry)?;
    out.executable_size = Some(fork.size);
    let mut reader = ForkReader {
        volume: &mut volume,
        fork,
    };
    out.scan_macho(&mut reader).await
}

async fn read_package<S: ReadAt>(
    volume: &mut Volume<'_, S>,
    catalog: &mut Catalog,
    root: Vec<Item>,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let mut choices = root
        .into_iter()
        .filter(|item| !item.name.starts_with('.') && pkg::package_name(&item.name));
    let item = choices
        .next()
        .ok_or(ScanError::NotFound("app or package at the HFS volume root"))?;
    if let Some(other) = choices.next() {
        out.nested_artifacts.extend([item.name, other.name]);
        return Err(ScanError::Unsupported("multiple nested PKGs in HFS volume"));
    }
    let (item, name, kind) = if item.file.is_some() {
        let name = item.name.clone();
        (item, name, nested::Kind::Package)
    } else {
        let name = format!("{}/Contents/Archive.pax.gz", item.name);
        let file = catalog
            .find_path(volume, item.id, "Contents/Archive.pax.gz", true)
            .await?;
        (file, name, nested::Kind::LegacyPackage)
    };
    let fork = file_fork(item, volume.geometry)?;
    nested::package(
        &mut ForkReader { volume, fork },
        kind,
        &name,
        work,
        target,
        out,
    )
    .await
}

//! Selective reads of ordinary APFS volumes using the Apple File System Reference.
use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, bundle, check_range,
    decode::DecodeBudget,
    inventory::{self, Allowance},
    le16, le32, le64, macho, nested, pkg,
};
use std::{
    collections::{HashSet, VecDeque},
    ops::Range,
    rc::Rc,
};
use unicode_normalization::UnicodeNormalization;

const BAD_OBJECT: ScanError = ScanError::Invalid("APFS object");
const BAD_NODE: ScanError = ScanError::Invalid("APFS B-tree node");
const BAD_RECORD: ScanError = ScanError::Invalid("APFS filesystem record");
const NX: u16 = 1;
const BTREE: u16 = 2;
const NODE: u16 = 3;
const OMAP: u16 = 11;
const VOLUME: u16 = 13;
const INODE: u8 = 3;
const EXTENT: u8 = 8;
const DREC: u8 = 9;
const ROOT_DIRECTORY: u64 = 2;
const FILE: u16 = 8;
const DIRECTORY: u16 = 4;
const PHYSICAL: u32 = 0x4000_0000;
const MAX_TREE_NODES: usize = 4096;
const MAX_TREE_RECORDS: usize = 256 * 1024;

struct Device<'a, S> {
    disk: &'a mut S,
    block_size: usize,
    blocks: u64,
    cache: VecDeque<(u64, Rc<[u8]>)>,
    work: &'a DecodeBudget<'a>,
    nodes_left: usize,
    records_left: usize,
}

impl<S: ReadAt> Device<'_, S> {
    fn charge_tree_node(&mut self, records: usize) -> Result<()> {
        self.work.check_deadline()?;
        if !self.work.strict() {
            return Ok(());
        }
        if self.nodes_left == 0 || records > self.records_left {
            return Err(ScanError::WorkLimit("APFS B-tree work limit reached"));
        }
        self.nodes_left -= 1;
        self.records_left -= records;
        Ok(())
    }

    async fn block(&mut self, address: u64) -> Result<Rc<[u8]>> {
        self.work.check_deadline()?;
        if address >= self.blocks {
            return Err(BAD_OBJECT);
        }
        if let Some(index) = self.cache.iter().position(|(paddr, _)| *paddr == address) {
            let entry = self.cache.remove(index).unwrap();
            let bytes = entry.1.clone();
            self.cache.push_front(entry);
            return Ok(bytes);
        }
        let bytes: Rc<[u8]> = self
            .disk
            .read_at(address * self.block_size as u64, self.block_size)
            .await?
            .into();
        self.cache.push_front((address, bytes.clone()));
        self.cache.truncate(48);
        Ok(bytes)
    }

    async fn checkpoint(&mut self) -> Result<Rc<[u8]>> {
        let mut best = self.block(0).await?;
        object(&best, &[NX])?;
        let slots = le32(&best, 104);
        let base = le64(&best, 112);
        if slots & 0x8000_0000 != 0 {
            return Err(ScanError::Unsupported("APFS checkpoint descriptor tree"));
        }
        let maximum = if self.work.strict() { 128 } else { 4096 };
        if slots > maximum {
            return Err(ScanError::Limit(
                "APFS checkpoint ring exceeds profile limit",
            ));
        }
        check_range(self.blocks, base, slots as u64)?;
        for index in (0..slots).step_by(128) {
            let start = (base + u64::from(index)) * self.block_size as u64;
            let count = (slots - index).min(128);
            let ring = self
                .disk
                .read_at(start, count as usize * self.block_size)
                .await?;
            for candidate in ring.chunks_exact(self.block_size) {
                if &candidate[32..36] == b"NXSB"
                    && le64(candidate, 16) > le64(&best, 16)
                    && candidate[36..72] == best[36..72]
                    && object(candidate, &[NX]).is_ok()
                {
                    best = candidate.into();
                }
            }
        }
        Ok(best)
    }
}

fn object(bytes: &[u8], types: &[u16]) -> Result<()> {
    // APFS places the two Fletcher-64 check words at the start of a
    // metadata block. They are fed in after the rest of the block.
    const MOD: u64 = u32::MAX as u64;
    if !types.contains(&le16(bytes, 24)) || matches!(le64(bytes, 0), 0 | u64::MAX) {
        return Err(BAD_OBJECT);
    }
    let mut low = 0;
    let mut high = 0;
    for word in bytes[8..]
        .as_chunks::<4>()
        .0
        .iter()
        .chain(bytes[..8].as_chunks::<4>().0)
    {
        low += u32::from_le_bytes(*word) as u64;
        high += low;
    }
    if low % MOD != 0 || high % MOD != 0 {
        return Err(ScanError::Invalid("APFS object checksum"));
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct TreeShape {
    key_size: usize,
    value_size: usize,
}

struct TreeNode<'a> {
    bytes: &'a [u8],
    layout: Option<TreeShape>,
    level: u16,
    count: usize,
    table_start: usize,
    keys_start: usize,
    values_end: usize,
}

impl<'a> TreeNode<'a> {
    fn parse(bytes: &'a [u8], layout: Option<TreeShape>) -> Result<Self> {
        object(bytes, &[BTREE, NODE])?;
        let flags = le16(bytes, 32);
        if flags & 0x18 != 0 {
            return Err(ScanError::Unsupported(
                "APFS hashed or headerless B-tree node",
            ));
        }
        let level = le16(bytes, 34);
        if level > 32 || (level == 0) != (flags & 2 != 0) {
            return Err(BAD_NODE);
        }
        let count = le32(bytes, 36) as usize;
        let table_start = 56 + le16(bytes, 40) as usize;
        let table_len = le16(bytes, 42) as usize;
        let keys_start = table_start + table_len;
        let values_end = bytes.len() - if flags & 1 != 0 { 40 } else { 0 };
        let layout = if flags & 4 != 0 {
            Some(layout.ok_or(ScanError::Unsupported(
                "APFS fixed-layout filesystem record",
            ))?)
        } else {
            None
        };
        let stride = if layout.is_some() { 4 } else { 8 };
        if keys_start > values_end || count > table_len / stride {
            return Err(BAD_NODE);
        }
        Ok(Self {
            bytes,
            layout,
            level,
            count,
            table_start,
            keys_start,
            values_end,
        })
    }

    fn entry(&self, index: usize) -> Result<(&'a [u8], &'a [u8])> {
        let (key_off, klen, value_off, vlen) = if let Some(layout) = self.layout {
            let pos = self.table_start + index * 4;
            let len = if self.level == 0 {
                layout.value_size
            } else {
                8
            };
            (
                le16(self.bytes, pos),
                layout.key_size,
                le16(self.bytes, pos + 2),
                len,
            )
        } else {
            let pos = self.table_start + index * 8;
            (
                le16(self.bytes, pos),
                le16(self.bytes, pos + 2) as usize,
                le16(self.bytes, pos + 4),
                le16(self.bytes, pos + 6) as usize,
            )
        };
        let key_at = self.keys_start + key_off as usize;
        if key_at + klen > self.values_end {
            return Err(BAD_NODE);
        }
        let key = &self.bytes[key_at..key_at + klen];
        if value_off == u16::MAX {
            return Ok((key, &[]));
        }
        let value_at = self
            .values_end
            .checked_sub(value_off as usize)
            .ok_or(BAD_NODE)?;
        if value_at < self.keys_start || vlen > value_off as usize {
            return Err(BAD_NODE);
        }
        Ok((key, &self.bytes[value_at..value_at + vlen]))
    }
}

#[derive(Clone, Copy)]
struct ObjectMap {
    tree: u64,
    xid: u64,
}

impl ObjectMap {
    async fn load(device: &mut Device<'_, impl ReadAt>, address: u64, xid: u64) -> Result<Self> {
        let bytes = device.block(address).await?;
        object(&bytes, &[OMAP])?;
        if le32(&bytes, 40) & 0xc000_0000 != PHYSICAL {
            return Err(ScanError::Unsupported("APFS nonphysical object-map tree"));
        }
        Ok(Self {
            tree: le64(&bytes, 48),
            xid,
        })
    }

    async fn get(self, device: &mut Device<'_, impl ReadAt>, oid: u64) -> Result<u64> {
        const SHAPE: TreeShape = TreeShape {
            key_size: 16,
            value_size: 16,
        };
        const MISSING: ScanError = ScanError::NotFound("APFS mapped object");
        let mut address = self.tree;
        let mut last_level = None;
        for _ in 0..32 {
            let bytes = device.block(address).await?;
            let node = TreeNode::parse(&bytes, Some(SHAPE))?;
            device.charge_tree_node(node.count)?;
            check_level(last_level, node.level)?;
            last_level = Some(node.level);

            let mut selected = None;
            for index in 0..node.count {
                let (key, value) = node.entry(index)?;
                if key.len() != 16 {
                    return Err(BAD_NODE);
                }
                let key = (le64(key, 0), le64(key, 8));
                if key > (oid, self.xid) {
                    break;
                }
                selected = Some((key, value));
            }
            let (key, value) = selected.ok_or(MISSING)?;
            if node.level == 0 {
                if key.0 != oid || value.len() != 16 || le32(value, 0) & 1 != 0 {
                    return Err(MISSING);
                }
                if le32(value, 0) & 0x0c != 0 || le32(value, 4) as usize != device.block_size {
                    return Err(ScanError::Unsupported(
                        "APFS encrypted, headerless or multi-block object",
                    ));
                }
                return Ok(le64(value, 8));
            }
            address = child(value)?;
        }
        Err(ScanError::Limit("APFS object map exceeds 32 levels"))
    }
}

fn check_level(parent: Option<u16>, current: u16) -> Result<()> {
    if parent.is_some_and(|level| level != current + 1) {
        return Err(BAD_NODE);
    }
    Ok(())
}

fn child(value: &[u8]) -> Result<u64> {
    if value.len() != 8 {
        return Err(BAD_NODE);
    }
    Ok(le64(value, 0))
}

struct Volume {
    root: u64,
    map: Option<ObjectMap>,
    case_sensitive: bool,
    hashed_names: bool,
}

impl Volume {
    async fn load(device: &mut Device<'_, impl ReadAt>, address: u64) -> Result<Self> {
        let bytes = device.block(address).await?;
        object(&bytes, &[VOLUME])?;
        if &bytes[32..36] != b"APSB" {
            return Err(BAD_OBJECT);
        }
        let incompat = le64(&bytes, 56);
        if le64(&bytes, 264) & 1 == 0 || incompat & 0x24 != 0 {
            return Err(ScanError::Unsupported("APFS encrypted or sealed volume"));
        }
        let map = match le32(&bytes, 116) & 0xc000_0000 {
            PHYSICAL => None,
            0 => Some(ObjectMap::load(device, le64(&bytes, 128), le64(&bytes, 16)).await?),
            _ => return Err(ScanError::Unsupported("APFS ephemeral filesystem tree")),
        };
        Ok(Self {
            root: le64(&bytes, 136),
            map,
            case_sensitive: incompat & 1 == 0,
            hashed_names: incompat & 9 != 0,
        })
    }

    async fn entries<T>(
        &self,
        device: &mut Device<'_, impl ReadAt>,
        target: (u64, u8),
        mut parse: impl FnMut(&[u8], &[u8]) -> Result<T>,
    ) -> Result<Vec<T>> {
        let mut result = Vec::new();
        let mut pending = vec![(self.root, None)];
        let mut seen = HashSet::new();
        while let Some((oid, parent)) = pending.pop() {
            if !seen.insert(oid) {
                return Err(BAD_NODE);
            }
            if seen.len() > 256 {
                return Err(ScanError::Limit("APFS lookup exceeds 256 nodes"));
            }
            let address = if let Some(map) = self.map {
                map.get(device, oid).await?
            } else {
                oid
            };
            let bytes = device.block(address).await?;
            let node = TreeNode::parse(&bytes, None)?;
            device.charge_tree_node(node.count)?;
            check_level(parent, node.level)?;

            if node.level == 0 {
                for index in 0..node.count {
                    let (key, value) = node.entry(index)?;
                    if file_key(key)? == target {
                        if result.len() >= 4096 {
                            return Err(ScanError::Limit("APFS lookup exceeds 4096 records"));
                        }
                        result.push(parse(key, value)?);
                    }
                }
            } else {
                let mut before = None;
                let mut matching = Vec::new();
                for index in 0..node.count {
                    let (key, value) = node.entry(index)?;
                    match file_key(key)?.cmp(&target) {
                        std::cmp::Ordering::Less => before = Some(child(value)?),
                        std::cmp::Ordering::Equal => matching.push(child(value)?),
                        std::cmp::Ordering::Greater => break,
                    }
                }
                // The preceding child can still contain matching keys. The
                // index's minimum keys are full keys, not just this prefix.
                pending.extend(
                    before
                        .into_iter()
                        .chain(matching)
                        .rev()
                        .map(|id| (id, Some(node.level))),
                );
            }
        }
        Ok(result)
    }

    async fn children(
        &self,
        device: &mut Device<'_, impl ReadAt>,
        directory: u64,
    ) -> Result<Vec<Entry>> {
        self.entries(device, (directory, DREC), |key, value| {
            let (name_start, name_len) = if self.hashed_names && key.len() >= 12 {
                (12, le32(key, 8) as usize & 0x3ff)
            } else if !self.hashed_names && key.len() >= 10 {
                (10, le16(key, 8) as usize)
            } else {
                return Err(BAD_RECORD);
            };
            if name_len > 1024 || value.len() < 18 {
                return Err(BAD_RECORD);
            }
            let name = key
                .get(name_start..name_start + name_len)
                .and_then(|name| name.strip_suffix(b"\0"))
                .ok_or(BAD_RECORD)?;
            let name = std::str::from_utf8(name)
                .map_err(|_| BAD_RECORD)?
                .to_owned();
            Ok(Entry {
                name,
                id: le64(value, 0),
                kind: le16(value, 16) & 0xf,
            })
        })
        .await
    }

    async fn find(
        &self,
        device: &mut Device<'_, impl ReadAt>,
        directory: u64,
        name: &str,
        kind: u16,
    ) -> Result<Entry> {
        let entries = self.children(device, directory).await?;
        let normalized: String = name.nfd().collect();
        let folded = (!self.case_sensitive).then(|| normalized.to_lowercase());
        let exact = entries.iter().position(|entry| {
            entry.kind == kind
                && (entry.name == name
                    || (self.hashed_names && entry.name.nfd().eq(normalized.chars())))
        });
        let index = exact
            .or_else(|| {
                let folded = folded.as_ref()?;
                entries.iter().position(|entry| {
                    entry.kind == kind
                        && entry.name.nfd().collect::<String>().to_lowercase() == *folded
                })
            })
            .ok_or(ScanError::NotFound("bundle path in APFS directory tree"))?;
        Ok(entries.into_iter().nth(index).unwrap())
    }

    async fn find_path(
        &self,
        device: &mut Device<'_, impl ReadAt>,
        mut parent: u64,
        path: &str,
        kind: u16,
    ) -> Result<Entry> {
        let mut parts = path.trim_start_matches("./").split('/').peekable();
        while let Some(part) = parts.next() {
            if parts.peek().is_none() {
                return self.find(device, parent, part, kind).await;
            }
            parent = self.find(device, parent, part, DIRECTORY).await?.id;
        }
        Err(ScanError::Invalid("empty APFS path"))
    }

    async fn file(&self, device: &mut Device<'_, impl ReadAt>, id: u64) -> Result<FileData> {
        let mut inodes = self
            .entries(device, (id, INODE), |_, value| inode(value))
            .await?;
        if inodes.len() != 1 {
            return Err(BAD_RECORD);
        }
        let (data_id, size) = inodes.pop().unwrap();
        let block_size = device.block_size as u64;
        let disk_size = block_size * device.blocks;
        let mut extents = self
            .entries(device, (data_id, EXTENT), |key, value| {
                if key.len() != 16 || value.len() != 24 {
                    return Err(BAD_RECORD);
                }
                let len = le64(value, 0);
                let block = le64(value, 8);
                let offset = le64(key, 8);
                if len == 0
                    || len >> 56 != 0
                    || !len.is_multiple_of(block_size)
                    || !offset.is_multiple_of(block_size)
                {
                    return Err(BAD_RECORD);
                }
                let end = offset.checked_add(len).ok_or(BAD_RECORD)?;
                let disk = block.checked_mul(block_size).ok_or(BAD_RECORD)?;
                if block != 0 {
                    check_range(disk_size, disk, len)?;
                }
                Ok(Extent {
                    logical: offset..end,
                    disk,
                })
            })
            .await?;
        extents.sort_unstable_by_key(|extent| extent.logical.start);
        if extents
            .windows(2)
            .any(|pair| pair[0].logical.end > pair[1].logical.start)
        {
            return Err(BAD_RECORD);
        }
        Ok(FileData { size, extents })
    }
}

fn file_key(key: &[u8]) -> Result<(u64, u8)> {
    if key.len() < 8 {
        return Err(BAD_NODE);
    }
    let encoded = le64(key, 0);
    Ok((encoded & 0x0fff_ffff_ffff_ffff, (encoded >> 60) as u8))
}

fn inode(bytes: &[u8]) -> Result<(u64, u64)> {
    if bytes.len() < 92 || le16(bytes, 80) & 0o170000 != 0o100000 {
        return Err(BAD_RECORD);
    }
    if le32(bytes, 68) & 0x20 != 0 {
        return Err(ScanError::Unsupported("APFS decmpfs-compressed file"));
    }
    if bytes.len() == 92 {
        return Ok((le64(bytes, 8), 0));
    }
    if bytes.len() < 96 {
        return Err(BAD_RECORD);
    }
    let count = le16(bytes, 92) as usize;
    let xfields_end = 96 + count * 4;
    let fields = bytes.get(96..xfields_end).ok_or(BAD_RECORD)?;
    let mut offset = xfields_end;
    for field in fields.as_chunks::<4>().0 {
        let len = le16(field, 2) as usize;
        let data = bytes.get(offset..offset + len).ok_or(BAD_RECORD)?;
        if field[0] == 8 {
            if data.len() != 40 {
                return Err(BAD_RECORD);
            }
            return Ok((le64(bytes, 8), le64(data, 0)));
        }
        offset += (len + 7) & !7;
    }
    Ok((le64(bytes, 8), 0))
}

struct Entry {
    name: String,
    id: u64,
    kind: u16,
}

struct Extent {
    logical: Range<u64>,
    disk: u64,
}

struct FileData {
    size: u64,
    extents: Vec<Extent>,
}

struct ApfsFile<'a, S> {
    data: FileData,
    disk: &'a mut S,
}

impl<S: ReadAt> ReadAt for ApfsFile<'_, S> {
    fn size(&self) -> u64 {
        self.data.size
    }

    fn remaining_budget(&self) -> u64 {
        self.disk.remaining_budget()
    }

    async fn read_at(&mut self, mut offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.data.size, offset, len as u64)?;
        let mut result = Vec::with_capacity(len);
        while result.len() < len {
            let index = self
                .data
                .extents
                .partition_point(|extent| extent.logical.end <= offset);
            let extent = self
                .data
                .extents
                .get(index)
                .filter(|extent| extent.logical.contains(&offset))
                .ok_or(ScanError::Invalid("APFS file extent gap"))?;
            let count = (len - result.len())
                .min((extent.logical.end - offset).min(usize::MAX as u64) as usize);
            if extent.disk == 0 {
                result.resize(result.len() + count, 0);
            } else {
                let position = extent.disk + (offset - extent.logical.start);
                result.extend(self.disk.read_at(position, count).await?);
            }
            offset += count as u64;
        }
        Ok(result)
    }
}

pub(crate) async fn scan(
    disk: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let first = disk.read_at(0, 48).await?;
    if &first[32..36] != b"NXSB" {
        return Err(BAD_OBJECT);
    }
    let block_size = le32(&first, 36) as usize;
    let blocks = le64(&first, 40);
    if !(4096..=65536).contains(&block_size)
        || !block_size.is_power_of_two()
        || blocks == 0
        || blocks > disk.size() / block_size as u64
    {
        return Err(ScanError::Invalid("APFS block geometry"));
    }
    let mut device = Device {
        disk,
        block_size,
        blocks,
        cache: VecDeque::new(),
        work,
        nodes_left: MAX_TREE_NODES,
        records_left: MAX_TREE_RECORDS,
    };
    let checkpoint = device.checkpoint().await?;
    if le64(&checkpoint, 64) & 0x100 != 0 {
        return Err(ScanError::Unsupported("APFS Fusion container"));
    }
    let map = ObjectMap::load(&mut device, le64(&checkpoint, 160), le64(&checkpoint, 16)).await?;
    let systems = le32(&checkpoint, 180) as usize;
    if systems > 100 {
        return Err(BAD_OBJECT);
    }
    let ids: Vec<_> = checkpoint[184..184 + 8 * systems]
        .as_chunks::<8>()
        .0
        .iter()
        .map(|bytes| u64::from_le_bytes(*bytes))
        .filter(|id| *id != 0)
        .collect();
    if ids.len() > 8 {
        return Err(ScanError::Limit("APFS container exceeds eight volumes"));
    }

    let mut unsupported = None;
    for id in ids {
        let address = map.get(&mut device, id).await?;
        let volume = match Volume::load(&mut device, address).await {
            Ok(volume) => volume,
            Err(error @ ScanError::Unsupported(_)) => {
                unsupported = Some(error);
                continue;
            }
            Err(error) => return Err(error),
        };
        if let Target::Executable(path) = target {
            let item = match volume
                .find_path(&mut device, ROOT_DIRECTORY, path, FILE)
                .await
            {
                Ok(item) => item,
                Err(ScanError::NotFound(_)) => continue,
                Err(error) => return Err(error),
            };
            out.executable_path = Some(path.to_owned());
            return read_executable(&mut device, &volume, item, out).await;
        }
        if let Target::Bundle(path) = target {
            match volume
                .find_path(&mut device, ROOT_DIRECTORY, path, DIRECTORY)
                .await
            {
                Ok(app) => {
                    return read_app(
                        &mut device,
                        &volume,
                        app.id,
                        path.trim_start_matches("./"),
                        out,
                    )
                    .await;
                }
                Err(ScanError::NotFound(_)) => (),
                Err(error) => return Err(error),
            }
        }
        let root = volume.children(&mut device, ROOT_DIRECTORY).await?;
        if matches!(target, Target::Auto)
            && let Some(app) = root
                .iter()
                .filter(|entry| {
                    entry.kind == DIRECTORY
                        && entry.name.ends_with(".app")
                        && !entry.name.starts_with('.')
                })
                .min_by(|a, b| a.name.cmp(&b.name))
        {
            return read_app(&mut device, &volume, app.id, &app.name, out).await;
        }

        let mut packages = root.into_iter().filter(|entry| {
            matches!(entry.kind, FILE | DIRECTORY)
                && !entry.name.starts_with('.')
                && pkg::package_name(&entry.name)
        });
        if let Some(entry) = packages.next() {
            if let Some(other) = packages.next() {
                out.nested_artifacts.extend([entry.name, other.name]);
                return Err(ScanError::Unsupported(
                    "multiple nested PKGs in APFS volume",
                ));
            }
            return read_package(&mut device, &volume, entry, work, target, out).await;
        }
    }
    let missing = match target {
        Target::Auto => "app at the APFS volume root",
        Target::Bundle(_) => "declared app in APFS volume",
        Target::Executable(_) => "declared executable in APFS volume",
    };
    Err(unsupported.unwrap_or(ScanError::NotFound(missing)))
}

async fn read_app(
    device: &mut Device<'_, impl ReadAt>,
    volume: &Volume,
    app_id: u64,
    app_path: &str,
    out: &mut ScanResult,
) -> Result<()> {
    out.bundle_path = Some(app_path.to_owned());
    let contents = volume.find(device, app_id, "Contents", DIRECTORY).await?;
    let info = volume.find(device, contents.id, "Info.plist", FILE).await?;
    let data = volume.file(device, info.id).await?;
    if data.size > bundle::MAX_PLIST {
        return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
    }
    let len = data.size as usize;
    let plist = ApfsFile {
        data,
        disk: device.disk,
    }
    .read_at(0, len)
    .await?;
    let path = bundle::apply_plist(&plist, app_path, out)?;
    let relative = &path[app_path.len() + "/Contents/".len()..];
    let primary = match volume.find_path(device, contents.id, relative, FILE).await {
        Ok(item) => read_executable(device, volume, item, out).await,
        Err(error) => Err(error),
    };
    let mut inventory = crate::BinaryInventory::default();
    if let Err(error) = &primary {
        inventory.partial(error.to_string());
    }
    let work = device.work;
    let mut allowance = Allowance::new(device.disk, work);
    let mut pending = vec![(contents.id, "Contents".to_owned())];
    let mut visited = HashSet::new();
    'walk: while let Some((parent, prefix)) = pending.pop() {
        if !visited.insert(parent) || prefix.len() > 8192 {
            inventory.partial("invalid APFS directory hierarchy");
            continue;
        }
        if let Err(error) = allowance.step(device.disk, work) {
            inventory.partial(error.to_string());
            break;
        }
        let children = match volume.children(device, parent).await {
            Ok(children) => children,
            Err(error) => {
                inventory.partial(error.to_string());
                if inventory::stop(&error) {
                    break;
                }
                continue;
            }
        };
        for item in children {
            let path = format!("{prefix}/{}", item.name);
            let Some(role) = inventory::role(&path) else {
                continue;
            };
            if item.kind == DIRECTORY {
                pending.push((item.id, path));
                continue;
            }
            if item.kind != FILE || path.strip_prefix("Contents/") == Some(relative) {
                continue;
            }
            if let Err(error) = allowance.step(device.disk, work) {
                inventory.partial(error.to_string());
                break 'walk;
            }
            let observed = match volume.file(device, item.id).await {
                Ok(data) => {
                    inventory::read(
                        &mut ApfsFile {
                            data,
                            disk: device.disk,
                        },
                        &path,
                        role,
                        &mut inventory,
                    )
                    .await
                }
                Err(error) => Err(error),
            };
            if let Err(error) = observed {
                inventory.partial(error.to_string());
                if inventory::stop(&error) {
                    break 'walk;
                }
            }
        }
    }
    out.inventory = Some(inventory);
    primary
}

async fn read_executable(
    device: &mut Device<'_, impl ReadAt>,
    volume: &Volume,
    item: Entry,
    out: &mut ScanResult,
) -> Result<()> {
    let data = volume.file(device, item.id).await?;
    out.executable_size = Some(data.size);
    macho::scan(
        &mut ApfsFile {
            data,
            disk: device.disk,
        },
        &mut out.architectures,
    )
    .await
}

async fn read_package(
    device: &mut Device<'_, impl ReadAt>,
    volume: &Volume,
    entry: Entry,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let (file, name, kind) = if entry.kind == FILE {
        let name = entry.name.clone();
        (entry, name, nested::Kind::Package)
    } else {
        let name = format!("{}/Contents/Archive.pax.gz", entry.name);
        let file = volume
            .find_path(device, entry.id, "Contents/Archive.pax.gz", FILE)
            .await?;
        (file, name, nested::Kind::LegacyPackage)
    };
    let data = volume.file(device, file.id).await?;
    let mut source = ApfsFile {
        data,
        disk: device.disk,
    };
    nested::package(&mut source, kind, &name, work, target, out).await
}

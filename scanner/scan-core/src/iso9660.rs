use crate::{
    BinaryInventory, ReadAt, Result, ScanError, ScanResult, Target, Window, be16, be32, bundle,
    check_range,
    decode::DecodeBudget,
    inventory::{self, Allowance},
    le16, le32,
};
use std::collections::HashSet;

const BLOCK: usize = 2048;
const PVD_OFFSET: u64 = 16 * BLOCK as u64;
const PVD_MAGIC: &[u8] = b"\x01CD001\x01";
const MAX_DIRECTORY: u64 = 1024 * 1024;
const BAD_RECORD: ScanError = ScanError::Invalid("ISO 9660 directory record");

pub(crate) async fn probe(disk: &mut impl ReadAt) -> Result<bool> {
    Ok(disk.size() >= PVD_OFFSET + BLOCK as u64
        && disk.read_at(PVD_OFFSET, PVD_MAGIC.len()).await? == PVD_MAGIC)
}

pub(crate) async fn scan(
    disk: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let pvd = disk.read_at(PVD_OFFSET, BLOCK).await?;
    let blocks = le32(&pvd, 80);
    let block_size = le16(&pvd, 128);
    if !pvd.starts_with(PVD_MAGIC)
        || blocks != be32(&pvd, 84)
        || block_size != be16(&pvd, 130)
        || block_size as usize != BLOCK
    {
        return Err(ScanError::Invalid("ISO 9660 primary volume descriptor"));
    }
    let volume_size = u64::from(blocks) * BLOCK as u64;
    check_range(disk.size(), 0, volume_size)?;
    let root_record = Record::parse(&pvd[156..190], volume_size)?;
    let root = root_record.entry(String::new(), true);
    let mut iso = Iso {
        disk,
        volume_size,
        susp_skip: None,
    };
    let root_bytes = iso.directory(&root).await?;
    let dot = Record::parse(&root_bytes, volume_size)?;
    if dot.name != b"\0" || !dot.directory {
        return Err(BAD_RECORD);
    }
    iso.susp_skip = dot
        .system_use
        .strip_prefix(b"SP\x07\x01\xbe\xef")
        .and_then(|skip| skip.first().copied());

    if let Target::Executable(path) = target {
        let path = bundle::archive_path(path).ok_or(BAD_RECORD)?;
        let entry = iso.find_path(&root, path, false).await?;
        out.executable_path = Some(path.to_owned());
        out.executable_size = Some(entry.size);
        return out.scan_macho(&mut entry.window(iso.disk)?).await;
    }
    let (app, path) = match target {
        Target::Auto => {
            let entry = iso
                .children(&root_bytes)?
                .into_iter()
                .filter(|entry| {
                    entry.directory && entry.name.ends_with(".app") && !entry.name.starts_with('.')
                })
                .min_by(|a, b| a.name.cmp(&b.name))
                .ok_or(ScanError::NotFound("app at the ISO 9660 volume root"))?;
            let name = entry.name.clone();
            (entry, name)
        }
        Target::Bundle(path) => {
            let path = bundle::archive_path(path).ok_or(BAD_RECORD)?;
            (iso.find_path(&root, path, true).await?, path.to_owned())
        }
        Target::Executable(_) => unreachable!(),
    };
    out.bundle_path = Some(path.clone());
    let contents = iso.find_path(&app, "Contents", true).await?;
    let info = iso.find_path(&contents, "Info.plist", false).await?;
    if info.size > bundle::MAX_PLIST {
        return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
    }
    let plist = info
        .window(iso.disk)?
        .read_at(0, info.size as usize)
        .await?;
    let executable = bundle::apply_plist(&plist, &path, out, false)?;
    let relative = &executable[path.len() + 1..];
    let primary = match iso.find_path(&app, relative, false).await {
        Ok(entry) => {
            out.executable_size = Some(entry.size);
            match entry.window(iso.disk) {
                Ok(mut window) => out.scan_macho(&mut window).await,
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    };
    out.inventory = Some(iso.inventory(contents, relative, &primary, work).await);
    primary
}

struct Entry {
    name: String,
    offset: u64,
    size: u64,
    directory: bool,
    contiguous: bool,
}

impl Entry {
    fn window<'a, S: ReadAt>(&self, source: &'a mut S) -> Result<Window<'a, S>> {
        if !self.contiguous {
            return Err(ScanError::Unsupported("non-contiguous ISO 9660 entry"));
        }
        Window::new(source, self.offset, self.size)
    }
}

struct Record<'a> {
    name: &'a [u8],
    system_use: &'a [u8],
    offset: u64,
    size: u64,
    directory: bool,
    contiguous: bool,
}

impl<'a> Record<'a> {
    fn parse(bytes: &'a [u8], volume_size: u64) -> Result<Self> {
        let len = *bytes.first().ok_or(BAD_RECORD)? as usize;
        let bytes = bytes
            .get(..len)
            .filter(|bytes| bytes.len() >= 34)
            .ok_or(BAD_RECORD)?;
        let block = le32(bytes, 2);
        let size = le32(bytes, 10);
        let name_end = 33 + bytes[32] as usize;
        let name = bytes
            .get(33..name_end)
            .filter(|name| !name.is_empty())
            .ok_or(BAD_RECORD)?;
        let system_use = bytes
            .get(name_end + usize::from(bytes[32] % 2 == 0)..)
            .ok_or(BAD_RECORD)?;
        if block != be32(bytes, 6) || size != be32(bytes, 14) {
            return Err(BAD_RECORD);
        }
        let offset = (u64::from(block) + u64::from(bytes[1])) * BLOCK as u64;
        check_range(volume_size, offset, u64::from(size))?;
        Ok(Self {
            name,
            system_use,
            offset,
            size: u64::from(size),
            directory: bytes[25] & 2 != 0,
            contiguous: bytes[25] & 0x80 == 0 && bytes[26..28] == [0, 0],
        })
    }

    fn entry(&self, name: String, regular: bool) -> Entry {
        Entry {
            name,
            offset: self.offset,
            size: self.size,
            directory: self.directory,
            contiguous: self.contiguous && regular,
        }
    }
}

struct Iso<'a, S> {
    disk: &'a mut S,
    volume_size: u64,
    susp_skip: Option<u8>,
}

impl<S: ReadAt> Iso<'_, S> {
    async fn directory(&mut self, entry: &Entry) -> Result<Vec<u8>> {
        if !entry.directory || entry.size == 0 {
            return Err(BAD_RECORD);
        }
        if entry.size > MAX_DIRECTORY {
            return Err(ScanError::Limit("ISO 9660 directory exceeds 1 MiB"));
        }
        entry
            .window(self.disk)?
            .read_at(0, entry.size as usize)
            .await
    }

    fn children(&self, bytes: &[u8]) -> Result<Vec<Entry>> {
        let mut entries = Vec::new();
        for block in bytes.chunks(BLOCK) {
            let mut records = block;
            while let Some(&len) = records.first().filter(|len| **len != 0) {
                let record = Record::parse(records, self.volume_size)?;
                records = &records[usize::from(len)..];
                if matches!(record.name, b"\0" | b"\x01") {
                    continue;
                }
                let system_use = self
                    .susp_skip
                    .and_then(|skip| record.system_use.get(usize::from(skip)..))
                    .unwrap_or_default();
                let (alias, regular) = rock_ridge(system_use)?;
                let name = match alias {
                    Some(name) => name,
                    None => {
                        let name = std::str::from_utf8(record.name).map_err(|_| BAD_RECORD)?;
                        name.split(';')
                            .next()
                            .unwrap()
                            .trim_end_matches('.')
                            .to_ascii_lowercase()
                    }
                };
                if !name.contains('/') && bundle::archive_path(&name).is_some() {
                    entries.push(record.entry(name, regular));
                }
            }
        }
        Ok(entries)
    }

    async fn find_path(&mut self, root: &Entry, path: &str, directory: bool) -> Result<Entry> {
        let mut bytes = self.directory(root).await?;
        let mut components = path.split('/').peekable();
        for _ in 0..64 {
            let part = components.next().ok_or(BAD_RECORD)?;
            let last = components.peek().is_none();
            let children = self.children(&bytes)?;
            let mut matching = children.into_iter().filter(|child| {
                child.directory == (!last || directory)
                    && (bundle::matches_path(&child.name, part)
                        || (self.susp_skip.is_none() && child.name.eq_ignore_ascii_case(part)))
            });
            let entry = matching
                .next()
                .ok_or(ScanError::NotFound("path in ISO 9660 volume"))?;
            if matching.next().is_some() {
                return Err(ScanError::Invalid("ambiguous path in ISO 9660 volume"));
            }
            if last {
                return Ok(entry);
            }
            bytes = self.directory(&entry).await?;
        }
        Err(ScanError::Limit("ISO 9660 path exceeds 64 components"))
    }

    async fn inventory(
        &mut self,
        contents: Entry,
        primary_path: &str,
        primary: &Result<()>,
        work: &DecodeBudget<'_>,
    ) -> BinaryInventory {
        let mut result = BinaryInventory::default();
        result.record_primary(primary);
        let mut allowance = Allowance::new(self.disk, work);
        let mut pending = vec![(contents, "Contents".to_owned())];
        let mut seen = HashSet::new();
        'walk: while let Some((directory, prefix)) = pending.pop() {
            if !seen.insert(directory.offset) || prefix.len() > 8192 {
                result.partial("invalid ISO 9660 directory hierarchy");
                continue;
            }
            if let Err(error) = allowance.step(self.disk, work) {
                result.partial(error.to_string());
                break;
            }
            let entries = self
                .directory(&directory)
                .await
                .and_then(|bytes| self.children(&bytes));
            let entries = match entries {
                Ok(entries) => entries,
                Err(error) => {
                    result.partial(error.to_string());
                    if inventory::stop(&error) {
                        break;
                    }
                    continue;
                }
            };
            for entry in entries {
                let path = format!("{prefix}/{}", entry.name);
                let Some(role) = inventory::role(&path).filter(|_| path != primary_path) else {
                    continue;
                };
                if entry.directory {
                    pending.push((entry, path));
                    continue;
                }
                if let Err(error) = allowance.step(self.disk, work) {
                    result.partial(error.to_string());
                    break 'walk;
                }
                let observed = match entry.window(self.disk) {
                    Ok(mut file) => inventory::read(&mut file, &path, role, &mut result).await,
                    Err(error) => Err(error),
                };
                if let Err(error) = observed {
                    result.partial(error.to_string());
                    if inventory::stop(&error) {
                        break 'walk;
                    }
                }
            }
        }
        result
    }
}

fn rock_ridge(mut bytes: &[u8]) -> Result<(Option<String>, bool)> {
    let mut name = Vec::new();
    let mut complete = false;
    let mut regular = true;
    while bytes.len() >= 4 && bytes[2] != 0 {
        let len = usize::from(bytes[2]);
        let entry = bytes
            .get(..len)
            .filter(|entry| entry.len() >= 4)
            .ok_or(BAD_RECORD)?;
        bytes = &bytes[len..];
        match &entry[..2] {
            b"ST" => break,
            b"SL" => regular = false,
            b"NM" if !complete && entry.len() >= 5 && entry[3] == 1 && entry[4] & !1 == 0 => {
                name.extend_from_slice(&entry[5..]);
                complete = entry[4] == 0;
            }
            _ => (),
        }
    }
    let name = if complete {
        Some(String::from_utf8(name).map_err(|_| BAD_RECORD)?)
    } else {
        None
    };
    Ok((name, regular))
}

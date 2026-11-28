//! The streams used by the Windows Installer database, read through CFB sector
//! chains. Cabinet streams and the rest of the MSI tables are skipped.
use super::{Windows, label};
use crate::{ReadAt, Result, ScanError, le16, le32, le64};
use std::collections::BTreeMap;

const INVALID: ScanError = ScanError::Invalid("MSI compound file metadata");
const TOO_LARGE: ScanError = ScanError::Limit("MSI metadata exceeds structural limits");
const END: u32 = 0xffff_fffe;
const FREE: u32 = 0xffff_ffff;
const CLSID: &[u8; 16] = b"\x84\x10\x0c\0\0\0\0\0\xc0\0\0\0\0\0\0\x46";
const SUMMARY: &[u8; 16] = b"\xe0\x85\x9f\xf2\xf9\x4f\x68\x10\xab\x91\x08\0\x2b\x27\xb3\xd9";

#[derive(Clone, Copy)]
struct Stream {
    sector: u32,
    size: u64,
}

struct Compound<'a, S> {
    source: &'a mut S,
    sector_size: usize,
    fat: Vec<u32>,
    fat_count: usize,
    difat: u32,
    difat_count: u32,
    tables: BTreeMap<usize, Vec<u8>>,
    mini_fat: u32,
    mini_fat_count: u32,
    root: Stream,
}

impl<S: ReadAt> Compound<'_, S> {
    async fn sector(&mut self, index: u32) -> Result<Vec<u8>> {
        self.source
            .read_at(
                (u64::from(index) + 1) * self.sector_size as u64,
                self.sector_size,
            )
            .await
    }

    async fn next(&mut self, index: u32) -> Result<u32> {
        let entries = self.sector_size / 4;
        let table = index as usize / entries;
        if table >= self.fat_count {
            return Err(INVALID);
        }
        if !self.tables.contains_key(&table) {
            while self.fat.len() <= table {
                if self.difat_count == 0 || self.difat >= END {
                    return Err(INVALID);
                }
                if self.difat_count > 4096 || table > 65_536 {
                    return Err(TOO_LARGE);
                }
                let data = self.sector(self.difat).await?;
                self.fat
                    .extend(data[..data.len() - 4].chunks_exact(4).map(|s| le32(s, 0)));
                self.difat = le32(&data, data.len() - 4);
                self.difat_count -= 1;
            }
            let data = self.sector(self.fat[table]).await?;
            self.tables.insert(table, data);
        }
        Ok(le32(&self.tables[&table], index as usize % entries * 4))
    }

    async fn chain_sector(&mut self, mut sector: u32, index: usize) -> Result<u32> {
        if index > 2048 {
            return Err(TOO_LARGE);
        }
        for _ in 0..index {
            sector = self.next(sector).await?;
        }
        if sector >= END {
            return Err(INVALID);
        }
        Ok(sector)
    }

    async fn stream(&mut self, stream: Stream, max: u64) -> Result<Vec<u8>> {
        if stream.size > max {
            return Err(TOO_LARGE);
        }
        self.prefix(stream, stream.size as usize).await
    }

    async fn prefix(&mut self, stream: Stream, length: usize) -> Result<Vec<u8>> {
        let length = stream.size.min(length as u64) as usize;
        let mut data = Vec::with_capacity(length);
        let mut sector = stream.sector;
        let mini = stream.size < 4096;
        let mut mini_tables = BTreeMap::new();
        let mut mini_data = BTreeMap::new();
        let mut seen = std::collections::BTreeSet::new();
        while data.len() < length {
            if sector >= END || !seen.insert(sector) {
                return Err(INVALID);
            }
            if mini {
                let pos = sector as usize % (self.sector_size / 64) * 64;
                let logical = u64::from(sector) * 64;
                if logical + 64 > self.root.size {
                    return Err(INVALID);
                }
                let index = (logical / self.sector_size as u64) as usize;
                let chunk = match mini_data.entry(index) {
                    std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        let physical = self.chain_sector(self.root.sector, index).await?;
                        entry.insert(self.sector(physical).await?)
                    }
                };
                data.extend_from_slice(&chunk[pos..pos + 64]);
                if data.len() >= length {
                    break;
                }
                let per_sector = self.sector_size / 4;
                let index = sector as usize / per_sector;
                if index as u32 >= self.mini_fat_count {
                    return Err(INVALID);
                }
                let entries = match mini_tables.entry(index) {
                    std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                    std::collections::btree_map::Entry::Vacant(entry) => {
                        let physical = self.chain_sector(self.mini_fat, index).await?;
                        entry.insert(self.sector(physical).await?)
                    }
                };
                sector = le32(entries, sector as usize % per_sector * 4);
            } else {
                let start = sector;
                let desired = (length - data.len()).div_ceil(self.sector_size).min(16);
                let mut sectors = 1;
                while sectors < desired {
                    let next = self.next(sector).await?;
                    if next != sector + 1 {
                        break;
                    }
                    sectors += 1;
                    sector = next;
                    if !seen.insert(sector) {
                        return Err(INVALID);
                    }
                }
                let offset = (u64::from(start) + 1) * self.sector_size as u64;
                let count = (sectors * self.sector_size).min(length - data.len());
                data.extend(self.source.read_at(offset, count).await?);
                if data.len() < length {
                    sector = self.next(sector).await?;
                }
            }
        }
        data.truncate(length);
        Ok(data)
    }
}

pub(crate) async fn inspect(input: &mut impl ReadAt, out: &mut Windows) -> Result<()> {
    let header = input.read_at(0, 512).await?;
    if !header.starts_with(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
        || le16(&header, 28) != 0xfffe
        || le16(&header, 32) != 6
        || le32(&header, 56) != 4096
    {
        return Err(INVALID);
    }
    let sector_size = match (le16(&header, 26), le16(&header, 30)) {
        (3, 9) => 512,
        (4, 12) => 4096,
        _ => return Err(INVALID),
    };
    let mut sector = le32(&header, 48);
    let mut cfb = Compound {
        source: input,
        sector_size,
        fat: header[76..]
            .chunks_exact(4)
            .map(|s| le32(s, 0))
            .take_while(|&s| s != FREE)
            .collect(),
        fat_count: le32(&header, 44) as usize,
        difat: le32(&header, 68),
        difat_count: le32(&header, 72),
        tables: BTreeMap::new(),
        mini_fat: le32(&header, 60),
        mini_fat_count: le32(&header, 64),
        root: Stream {
            sector: END,
            size: 0,
        },
    };
    let mut streams = BTreeMap::new();
    let mut visited = std::collections::BTreeSet::new();
    while sector != END {
        if visited.len() >= 32 {
            return Err(TOO_LARGE);
        }
        if !visited.insert(sector) {
            return Err(INVALID);
        }
        let directory = cfb.sector(sector).await?;
        if visited.len() == 1 {
            let root = &directory[..128];
            if root[66] != 5 || &root[80..96] != CLSID {
                return Err(ScanError::Unsupported(
                    "compound document without MSI package CLSID",
                ));
            }
            cfb.root = directory_stream(root, sector_size);
            out.installer_kind = Some("msi");
            out.payload_status = Some(super::UNKNOWN_PAYLOAD);
        }
        for entry in directory.chunks_exact(128).filter(|e| e[66] == 2) {
            let len = usize::from(le16(entry, 64));
            if !(2..=64).contains(&len) || len % 2 != 0 {
                continue;
            }
            let name: Vec<_> = entry[..len - 2]
                .chunks_exact(2)
                .map(|word| le16(word, 0))
                .collect();
            let name = decode_stream_name(&name);
            if matches!(
                name.as_str(),
                "\u{5}SummaryInformation" | "!Property" | "!_StringPool" | "!_StringData"
            ) {
                streams.insert(name, directory_stream(entry, sector_size));
            }
        }
        if streams.len() == 4 {
            break;
        }
        sector = cfb.next(sector).await?;
    }
    if let Some(&summary) = streams.get("\u{5}SummaryInformation") {
        let data = cfb.stream(summary, 64 * 1024).await?;
        if let Some(template) = template(&data) {
            for platform in template.split(';').next().unwrap_or("").split(',') {
                let arch = match platform.trim().to_ascii_lowercase().as_str() {
                    "" | "intel" => "x86",
                    "x64" => "x64",
                    "arm64" => "arm64",
                    "arm" => "arm32",
                    "intel64" => "ia64",
                    _ => continue,
                };
                out.observe(arch);
            }
            if !out.architectures.is_empty() {
                out.architecture_source = Some("msi_template");
            }
        }
    }
    if let (Some(&pool), Some(&data), Some(&property)) = (
        streams.get("!_StringPool"),
        streams.get("!_StringData"),
        streams.get("!Property"),
    ) && property.size <= 32 * 1024
        && pool.size >= 4
    {
        let property = cfb.stream(property, 32 * 1024).await?;
        let prefix = cfb.prefix(pool, 4).await?;
        let encoding = le16(&prefix, 0);
        let width = if le16(&prefix, 2) & 0x8000 != 0 { 3 } else { 2 };
        if property.len().is_multiple_of(2 * width) {
            let largest = property
                .chunks_exact(width)
                .map(string_id)
                .max()
                .unwrap_or_default();
            let pool = cfb.prefix(pool, (4 + largest * 8).min(128 * 1024)).await?;
            let (strings, needed) = string_locations(&pool[4..], &property, width);
            let data = cfb.prefix(data, needed.min(128 * 1024)).await?;
            apply_properties(&strings, &data, &property, encoding, width, out);
        }
    }
    Ok(())
}

fn directory_stream(entry: &[u8], sector_size: usize) -> Stream {
    Stream {
        sector: le32(entry, 116),
        size: if sector_size == 512 {
            le32(entry, 120).into()
        } else {
            le64(entry, 120)
        },
    }
}

fn decode_stream_name(words: &[u16]) -> String {
    const ALPHABET: &[u8; 64] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._";
    let mut name = String::new();
    for &word in words {
        match word {
            0x3800..=0x47ff => {
                let pair = usize::from(word - 0x3800);
                name.push(ALPHABET[pair & 63].into());
                name.push(ALPHABET[pair >> 6].into());
            }
            0x4800..=0x483f => name.push(ALPHABET[usize::from(word - 0x4800)].into()),
            0x4840 => name.push('!'),
            _ => name.push(char::from_u32(word.into()).unwrap_or('\u{fffd}')),
        }
    }
    name
}

fn template(data: &[u8]) -> Option<String> {
    if data.len() < 48 || le16(data, 0) != 0xfffe || le32(data, 24) == 0 || &data[28..44] != SUMMARY
    {
        return None;
    }
    let section = data.get(le32(data, 44) as usize..)?;
    if section.len() < 8 {
        return None;
    }
    let section = section.get(..le32(section, 0) as usize)?;
    if section.len() < 8 {
        return None;
    }
    let entry = section[8..]
        .chunks_exact(8)
        .take(le32(section, 4) as usize)
        .find(|e| le32(e, 0) == 7)?;
    let value = section.get(le32(entry, 4) as usize..)?;
    if value.len() < 8 {
        return None;
    }
    let units = le32(value, 4) as usize;
    match le32(value, 0) {
        30 => Some(
            std::str::from_utf8(value.get(8..8usize.checked_add(units)?)?)
                .ok()?
                .trim_end_matches('\0')
                .to_owned(),
        ),
        31 => {
            let words: Vec<_> = value
                .get(8..8usize.checked_add(units.checked_mul(2)?)?)?
                .chunks_exact(2)
                .map(|s| le16(s, 0))
                .take_while(|&c| c != 0)
                .collect();
            String::from_utf16(&words).ok()
        }
        _ => None,
    }
}

fn string_id(id: &[u8]) -> usize {
    usize::from(le16(id, 0)) + (usize::from(*id.get(2).unwrap_or(&0)) << 16)
}

fn string_locations(
    pool: &[u8],
    property: &[u8],
    width: usize,
) -> (BTreeMap<usize, std::ops::Range<usize>>, usize) {
    let mut wanted: std::collections::BTreeSet<_> = property
        .chunks_exact(width)
        .map(string_id)
        .filter(|&id| id != 0)
        .collect();
    let mut strings = BTreeMap::new();
    let mut pool = pool.chunks_exact(4);
    let mut id = 1;
    let mut offset = 0_usize;
    let mut needed = 0;
    while !wanted.is_empty()
        && let Some(entry) = pool.next()
    {
        let low = usize::from(le16(entry, 0));
        let references = usize::from(le16(entry, 2));
        let size = if low == 0 && references != 0 {
            let Some(next) = pool.next() else { break };
            le32(next, 0) as usize
        } else {
            low
        };
        let Some(end) = offset.checked_add(size) else {
            break;
        };
        if wanted.remove(&id) && size <= 4096 {
            strings.insert(id, offset..end);
            needed = end;
        }
        offset = end;
        id += 1;
    }
    (strings, needed)
}

fn apply_properties(
    strings: &BTreeMap<usize, std::ops::Range<usize>>,
    data: &[u8],
    property: &[u8],
    encoding: u16,
    width: usize,
    out: &mut Windows,
) {
    let (keys, values) = property.split_at(property.len() / 2);
    let string = |id: &[u8]| -> Option<&[u8]> { data.get(strings.get(&string_id(id))?.clone()) };
    for (key, value) in keys.chunks_exact(width).zip(values.chunks_exact(width)) {
        let field = match string(key) {
            Some(b"ProductName") => &mut out.product_name,
            Some(b"ProductVersion") => &mut out.version,
            Some(b"Manufacturer") => &mut out.publisher,
            _ => continue,
        };
        *field = string(value).and_then(|value| decode_label(value, encoding));
    }
}

fn decode_label(value: &[u8], encoding: u16) -> Option<String> {
    if encoding == 1252 && !value.is_ascii() {
        const EXT: [char; 32] = [
            '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž',
            '\u{8f}', '\u{90}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ',
            '\u{9d}', 'ž', 'Ÿ',
        ];
        return label(
            &value
                .iter()
                .map(|&b| match b {
                    128..=159 => EXT[usize::from(b - 128)],
                    _ => char::from(b),
                })
                .collect::<String>(),
        );
    }
    let text = std::str::from_utf8(value).ok()?;
    (encoding == 65001 || text.is_ascii())
        .then(|| label(text))
        .flatten()
}

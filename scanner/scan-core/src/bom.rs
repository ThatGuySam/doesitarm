use crate::{be16, be32, bundle};
use std::collections::{BTreeMap, BTreeSet};

const MAX_PATHS: usize = 50_000;

pub(crate) struct Plist {
    pub(crate) path: String,
    pub(crate) size: usize,
    pub(crate) checksum: u32,
}

struct Record<'a> {
    name: &'a str,
    parent: u32,
    metadata: &'a [u8],
}

struct Bom<'a> {
    bytes: &'a [u8],
    blocks: &'a [u8],
}

impl<'a> Bom<'a> {
    fn block(&self, id: u32) -> Option<&'a [u8]> {
        let at = (id as usize).checked_mul(8)?;
        let entry = self.blocks.get(at..)?.get(..8)?;
        region(self.bytes, entry, 0)
    }

    fn paths(&self, tree: &[u8]) -> Option<BTreeMap<u32, Record<'a>>> {
        if tree.get(..4)? != b"tree" || number(tree, 4)? != 1 {
            return None;
        }
        let count = number(tree, 16)? as usize;
        if count > MAX_PATHS {
            return None;
        }
        let mut leaf = number(tree, 8)?;
        let mut visited = BTreeSet::new();
        let mut found_leaf = false;
        for _ in 0..64 {
            if !visited.insert(leaf) {
                return None;
            }
            let block = self.block(leaf)?;
            match be16(block.get(..12)?, 0) {
                0 if be16(block, 2) > 0 => {
                    leaf = number(block, 12)?;
                }
                1 => {
                    visited.remove(&leaf);
                    found_leaf = true;
                    break;
                }
                _ => return None,
            }
        }
        if !found_leaf {
            return None;
        }

        let mut records = BTreeMap::new();
        let mut previous = 0;
        while leaf != 0 {
            if !visited.insert(leaf) || visited.len() > MAX_PATHS {
                return None;
            }
            let node = self.block(leaf)?;
            let header = node.get(..12)?;
            let entries = be16(header, 2) as usize;
            if be16(header, 0) != 1
                || be32(header, 8) != previous
                || records.len() + entries > count
            {
                return None;
            }
            let data = node.get(12..12 + 8 * entries)?.as_chunks::<8>().0;
            for entry in data {
                let pointer = self.block(be32(entry, 0))?;
                let file = self.block(be32(entry, 4))?;
                let id = number(pointer, 0)?;
                let parent = number(file, 0)?;
                let name = std::str::from_utf8(file.get(4..)?.split(|b| *b == 0).next()?).ok()?;
                let metadata = self.block(number(pointer, 4)?)?.get(..31)?;
                if id == 0 || name.is_empty() || name.contains('/') {
                    return None;
                }
                if records
                    .insert(
                        id,
                        Record {
                            name,
                            parent,
                            metadata,
                        },
                    )
                    .is_some()
                {
                    return None;
                }
            }
            previous = leaf;
            leaf = be32(header, 4);
        }
        (records.len() == count).then_some(records)
    }
}

fn number(bytes: &[u8], start: usize) -> Option<u32> {
    Some(be32(bytes.get(start..)?.get(..4)?, 0))
}

fn region<'a>(bytes: &'a [u8], rule: &[u8], start: usize) -> Option<&'a [u8]> {
    let offset = number(rule, start)? as usize;
    let len = number(rule, start + 4)? as usize;
    bytes.get(offset..)?.get(..len)
}

fn variable(mut vars: &[u8], sought: &[u8]) -> Option<u32> {
    let count = number(vars, 0)?;
    vars = &vars[4..];
    for _ in 0..count {
        let id = number(vars, 0)?;
        let length = *vars.get(4)? as usize;
        let name = vars.get(5..5 + length)?;
        if name == sought {
            return Some(id);
        }
        vars = &vars[5 + length..];
    }
    None
}

fn resolve(records: &BTreeMap<u32, Record<'_>>, mut id: u32) -> Option<String> {
    let mut names = Vec::new();
    for _ in 0..128 {
        let record = records.get(&id)?;
        names.push(record.name);
        id = record.parent;
        if id == 0 {
            names.reverse();
            return Some(names.join("/"));
        }
    }
    None
}

/// A BOM can verify detached file bytes and indicate where to look. Near-final
/// path IDs are only a hint. The CPIO parser must independently confirm the path.
pub(crate) fn late_plist(bytes: &[u8]) -> Option<Plist> {
    if bytes.get(..8)? != b"BOMStore" || number(bytes, 8)? != 1 {
        return None;
    }
    let index = region(bytes, bytes, 16)?;
    let count = number(index, 0)? as usize;
    let table = index.get(4..)?.get(..count.checked_mul(8)?)?;
    let bom = Bom {
        bytes,
        blocks: table,
    };
    let tree = bom.block(variable(region(bytes, bytes, 24)?, b"Paths")?)?;
    let records = bom.paths(tree)?;
    let last_id = *records.last_key_value()?.0;
    let mut found = None;
    for (&id, record) in &records {
        if record.name != "Info.plist" || record.metadata[0] != 1 {
            continue;
        }
        let path = resolve(&records, id)?;
        let Some(path) =
            bundle::archive_path(&path).filter(|path| bundle::outer_plist(path).is_some())
        else {
            continue;
        };
        let size = be32(record.metadata, 18) as usize;
        if found.is_some() || last_id - id > 32 || size == 0 || size as u64 > bundle::MAX_PLIST {
            return None;
        }
        found = Some(Plist {
            path: path.to_owned(),
            size,
            checksum: be32(record.metadata, 23),
        });
    }
    found
}

pub(crate) fn checksum(bytes: &[u8]) -> u32 {
    let mut remainder = 0u32;
    let mut fold = |byte| {
        remainder ^= u32::from(byte) << 24;
        for _ in 0..8 {
            remainder = if remainder & 0x80000000 != 0 {
                (remainder << 1) ^ 0x04c11db7
            } else {
                remainder << 1
            };
        }
    };
    bytes.iter().copied().for_each(&mut fold);
    let mut len = bytes.len();
    while len != 0 {
        fold(len as u8);
        len >>= 8;
    }
    !remainder
}

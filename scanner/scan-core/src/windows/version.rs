use super::{Windows, label};
use crate::{ReadAt, Result, le16, le32};

const DIRECTORY: u32 = 1 << 31;

pub(super) enum ResourceType {
    Number(u32),
    Data,
}

pub(super) async fn locate(
    input: &mut impl ReadAt,
    base: u64,
    size: u32,
    resource_type: ResourceType,
    resource_id: Option<u32>,
) -> Result<Option<(u32, u32)>> {
    let mut position = 0;
    for level in 0..3 {
        if size.saturating_sub(position) < 16 {
            return Ok(None);
        }
        let directory = input.read_at(base + u64::from(position), 16).await?;
        let count = u32::from(le16(&directory, 12)) + u32::from(le16(&directory, 14));
        let len = count * 8;
        if count == 0 || count > 1024 || len > size - position - 16 {
            return Ok(None);
        }
        let entries = input
            .read_at(base + u64::from(position) + 16, len as usize)
            .await?;
        let mut selected = None;
        for entry in entries.chunks_exact(8) {
            let name = le32(entry, 0);
            let child = le32(entry, 4);
            if (child & DIRECTORY != 0) != (level != 2) {
                continue;
            }
            let matches = match level {
                0 => match resource_type {
                    ResourceType::Number(id) => name == id,
                    ResourceType::Data if name & DIRECTORY != 0 => {
                        let offset = name & !DIRECTORY;
                        size.saturating_sub(offset) >= 10
                            && input.read_at(base + u64::from(offset), 10).await?
                                == b"\x04\0D\0A\0T\0A\0"
                    }
                    ResourceType::Data => false,
                },
                1 => resource_id.is_none_or(|id| name == id),
                _ => true,
            };
            if matches {
                selected = Some(child & !DIRECTORY);
                break;
            }
        }
        let Some(child) = selected else {
            return Ok(None);
        };
        position = child;
    }
    if size.saturating_sub(position) < 16 {
        return Ok(None);
    }
    let data = input.read_at(base + u64::from(position), 16).await?;
    Ok(Some((le32(&data, 0), le32(&data, 4))))
}

struct Block<'a> {
    key: String,
    value: &'a [u8],
    children: &'a [u8],
}

fn parse(bytes: &[u8]) -> Option<Block<'_>> {
    if bytes.len() < 6 {
        return None;
    }
    let bytes = bytes.get(..usize::from(le16(bytes, 0)))?;
    let tail = bytes.get(6..)?;
    let mut key = Vec::new();
    for (index, word) in tail.chunks_exact(2).enumerate() {
        let word = le16(word, 0);
        if word != 0 {
            key.push(word);
            continue;
        }
        let start = (6 + 2 * (index + 1)).next_multiple_of(4);
        let len = usize::from(le16(bytes, 2)) * if le16(bytes, 4) == 1 { 2 } else { 1 };
        let end = start + len;
        return Some(Block {
            key: String::from_utf16(&key).ok()?,
            value: bytes.get(start..end)?,
            children: bytes.get(end.next_multiple_of(4)..).unwrap_or_default(),
        });
    }
    None
}

fn children(mut bytes: &[u8]) -> impl Iterator<Item = Block<'_>> {
    std::iter::from_fn(move || {
        let block = parse(bytes)?;
        bytes = bytes
            .get(usize::from(le16(bytes, 0)).next_multiple_of(4)..)
            .unwrap_or_default();
        Some(block)
    })
}

pub(super) fn apply(bytes: &[u8], out: &mut Windows) -> Option<&'static str> {
    let Some(root) = parse(bytes).filter(|block| block.key == "VS_VERSION_INFO") else {
        return None;
    };
    let fixed = root.value;
    let mut description = None;
    let mut squirrel = false;
    for table in children(root.children)
        .filter(|b| b.key == "StringFileInfo")
        .flat_map(|b| children(b.children))
    {
        for field in children(table.children) {
            let target = match field.key.as_str() {
                "ProductName" => &mut out.product_name,
                "CompanyName" => &mut out.publisher,
                "ProductVersion" => &mut out.version,
                "FileDescription" => &mut description,
                "SquirrelAwareVersion" => {
                    squirrel = true;
                    continue;
                }
                _ => continue,
            };
            if target.is_none() {
                let words: Vec<_> = field
                    .value
                    .chunks_exact(2)
                    .map(|word| le16(word, 0))
                    .take_while(|&word| word != 0)
                    .collect();
                *target = String::from_utf16(&words)
                    .ok()
                    .and_then(|value| label(&value));
            }
        }
    }
    if out.version.is_none() && fixed.len() >= 24 && le32(fixed, 0) == 0xfeef04bd {
        let high = le32(fixed, 16);
        let low = le32(fixed, 20);
        if high != 0 || low != 0 {
            out.version = Some(format!(
                "{}.{}.{}.{}",
                high >> 16,
                high & 65535,
                low >> 16,
                low & 65535
            ));
        }
    }
    let description = description
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let product = out
        .product_name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if squirrel && description.contains("installer")
        || description.contains("installer for squirrel-based")
    {
        Some("squirrel")
    } else if description == "inno setup" {
        Some("inno_setup")
    } else if ["installer", "installation", "setup", "bootstrapper"]
        .iter()
        .any(|key| {
            let mentions = |text: &str| text.split_ascii_whitespace().any(|word| word == *key);
            mentions(&description) || mentions(&product)
        })
    {
        Some("exe_installer")
    } else {
        None
    }
}

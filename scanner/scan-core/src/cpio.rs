use crate::{
    ReadAt, Result, ScanError, ScanResult, bom, bundle, check_range, stream_bundle::StreamBundle,
};

const INVALID: ScanError = ScanError::Invalid("CPIO archive header");

enum Encoding {
    Odc,
    Newc,
}

impl Encoding {
    fn from_magic(magic: &[u8]) -> Option<Self> {
        match magic {
            b"070707" => Some(Self::Odc),
            b"070701" | b"070702" => Some(Self::Newc),
            _ => None,
        }
    }

    fn head_size(&self) -> usize {
        match self {
            Self::Odc => 76,
            Self::Newc => 110,
        }
    }

    fn fields(&self, rest: &[u8]) -> Result<(u64, u64, u64)> {
        let (mode, name_size, size, radix) = match self {
            Self::Odc => (&rest[12..18], &rest[53..59], &rest[59..70], 8),
            Self::Newc => (&rest[8..16], &rest[88..96], &rest[48..56], 16),
        };
        let number = |field| {
            std::str::from_utf8(field)
                .ok()
                .and_then(|s| u64::from_str_radix(s, radix).ok())
                .ok_or(INVALID)
        };
        Ok((number(mode)?, number(name_size)?, number(size)?))
    }

    fn align(&self, value: u64) -> Result<u64> {
        match self {
            Self::Odc => Ok(value),
            Self::Newc => value.checked_add(3).map(|n| n & !3).ok_or(INVALID),
        }
    }

    fn header_numbers_valid(&self, header: &[u8]) -> bool {
        match self {
            Self::Odc => header.iter().all(|byte| matches!(byte, b'0'..=b'7')),
            Self::Newc => header.iter().all(u8::is_ascii_hexdigit),
        }
    }
}

pub(crate) fn recognized(magic: &[u8]) -> bool {
    Encoding::from_magic(magic).is_some()
}

pub(crate) async fn scan_with(
    input: &mut impl ReadAt,
    mut bundle: StreamBundle<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let mut offset = 0;
    for _ in 0..250_000 {
        let mut header = input.read_at(offset, 76).await?;
        let encoding = Encoding::from_magic(&header[..6])
            .ok_or(ScanError::Unsupported("CPIO payload encoding"))?;
        let head_size = encoding.head_size();
        if head_size > header.len() {
            header.extend(input.read_at(offset + 76, head_size - 76).await?);
        }
        let (mode, name_size, size) = encoding.fields(&header[6..])?;
        if !(1..=65536).contains(&name_size) {
            return Err(INVALID);
        }
        let name_at = offset + head_size as u64;
        let bytes = input.read_at(name_at, name_size as usize).await?;
        let name = bytes.strip_suffix(b"\0").ok_or(INVALID)?;
        if name == b"TRAILER!!!" {
            return Err(bundle.missing());
        }
        let start = encoding.align(name_at + name_size)?;
        check_range(input.size(), start, size)?;
        if let Ok(path) = std::str::from_utf8(name) {
            match mode & 0o170000 {
                0o100000 if bundle.file(input, path, start, size, out).await? => return Ok(()),
                0o120000 if bundle.is_executable_path(path) => {
                    return Err(ScanError::Unsupported(
                        "declared CPIO executable is a symlink",
                    ));
                }
                _ => (),
            }
        }
        offset = encoding.align(start + size)?;
    }
    Err(ScanError::Limit("CPIO exceeds 250,000 entries"))
}

/// Find a detached record matching an independent BOM and walk its CPIO
/// successors to the trailer, at decoded offsets relative to the archive start.
pub(crate) fn tail_plist<'a>(
    bytes: &'a [u8],
    logical_start: u64,
    sought: &bom::Plist,
) -> Option<(usize, &'a [u8])> {
    for (at, magic) in bytes.windows(6).enumerate() {
        let Some(encoding) = Encoding::from_magic(magic) else {
            continue;
        };
        let Some(entry) = tail_entry(bytes, &encoding, logical_start, at) else {
            continue;
        };
        if entry.mode & 0o170000 != 0o100000
            || entry.data.len() != sought.size
            || bundle::archive_path(entry.name) != Some(sought.path.as_str())
            || bom::checksum(entry.data) != sought.checksum
        {
            continue;
        }
        let mut next = entry.next;
        for _ in 0..128 {
            let Some(following) = tail_entry(bytes, &encoding, logical_start, next) else {
                break;
            };
            if following.name == "TRAILER!!!" {
                let padding = &bytes[following.next..];
                if following.data.is_empty()
                    && padding.len() <= 65_536
                    && padding.iter().all(|b| *b == 0)
                {
                    return Some((at, entry.data));
                }
                break;
            }
            next = following.next;
        }
    }
    None
}

struct TailEntry<'a> {
    name: &'a str,
    mode: u64,
    data: &'a [u8],
    next: usize,
}

fn tail_entry<'a>(
    bytes: &'a [u8],
    encoding: &Encoding,
    logical_start: u64,
    at: usize,
) -> Option<TailEntry<'a>> {
    let header = bytes.get(at..)?.get(..encoding.head_size())?;
    if !matches!(
        (encoding, &header[..6]),
        (Encoding::Odc, b"070707") | (Encoding::Newc, b"070701" | b"070702")
    ) || !encoding.header_numbers_valid(&header[6..])
    {
        return None;
    }
    let (mode, name_size, size) = encoding.fields(&header[6..]).ok()?;
    if !(1..=65536).contains(&name_size) {
        return None;
    }
    let name_at = at + encoding.head_size();
    let name_end = name_at + name_size as usize;
    let name = bytes.get(name_at..name_end)?.strip_suffix(b"\0")?;
    let name = std::str::from_utf8(name).ok()?;
    if name.is_empty() || name.contains('\0') {
        return None;
    }
    let align = |offset| {
        usize::try_from(encoding.align(logical_start + offset)? - logical_start)
            .map_err(|_| INVALID)
    };
    let start = align(name_end as u64).ok()?;
    let data = bytes.get(start..)?.get(..usize::try_from(size).ok()?)?;
    let next = align((start + data.len()) as u64).ok()?;
    (next <= bytes.len()).then_some(TailEntry {
        name,
        mode,
        data,
        next,
    })
}

use crate::{ReadAt, Result, ScanError, ScanResult, check_range, stream_bundle::StreamBundle};

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
}

pub(crate) fn recognized(magic: &[u8]) -> bool {
    Encoding::from_magic(magic).is_some()
}

pub(crate) async fn scan(input: &mut impl ReadAt, out: &mut ScanResult) -> Result<()> {
    let mut offset = 0;
    let mut bundle = StreamBundle::default();
    for _ in 0..250_000 {
        let magic = input.read_at(offset, 6).await?;
        let encoding =
            Encoding::from_magic(&magic).ok_or(ScanError::Unsupported("CPIO payload encoding"))?;
        let head_size = encoding.head_size();
        let rest = input.read_at(offset + 6, head_size - 6).await?;
        let (mode, name_size, size) = encoding.fields(&rest)?;
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
        if mode & 0o170000 == 0o100000
            && let Ok(path) = std::str::from_utf8(name)
            && bundle.file(input, path, start, size, out).await?
        {
            return Ok(());
        }
        offset = encoding.align(start + size)?;
    }
    Err(ScanError::Limit("CPIO exceeds 250,000 entries"))
}

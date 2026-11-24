use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, check_range, decode::DecodeBudget,
    stream_bundle::StreamBundle,
};

const BLOCK: usize = 512;
const MAX_METADATA: u64 = 64 * 1024;

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let mut pos = 0;
    let mut next_path = None;
    let mut next_size = None;
    let mut bundle = StreamBundle::new(target);

    for _ in 0..work.archive_entry_limit() {
        let header = input.read_at(pos, BLOCK).await?;
        if header.iter().all(|byte| *byte == 0) {
            return Err(bundle.missing());
        }
        check_header(&header)?;
        let start = pos + BLOCK as u64;
        let mut size = number(&header[124..136])?;
        match header[156] {
            b'L' | b'x' | b'g' => {
                if size > MAX_METADATA {
                    return Err(ScanError::Limit("tar extended header exceeds 64 KiB"));
                }
                let extension = input.read_at(start, size as usize).await?;
                if header[156] == b'L' {
                    next_path = text(&extension);
                } else if header[156] == b'x' {
                    let pax = parse_pax(&extension)?;
                    next_path = pax.0.or(next_path);
                    next_size = pax.1.or(next_size);
                }
            }
            kind => {
                size = next_size.take().unwrap_or(size);
                let path = next_path.take().or_else(|| header_path(&header));
                if let Some(path) = path {
                    match kind {
                        b'0' | 0 if bundle.file(input, &path, start, size, out).await? => {
                            return Ok(());
                        }
                        b'1' | b'2' if bundle.is_executable_path(&path) => {
                            return Err(ScanError::Unsupported(
                                "declared tar executable is a link",
                            ));
                        }
                        _ => (),
                    }
                }
            }
        }
        let padded = size
            .checked_add(BLOCK as u64 - 1)
            .map(|n| n / BLOCK as u64 * BLOCK as u64)
            .ok_or(ScanError::Invalid("tar member size overflow"))?;
        check_range(input.size(), start, padded)?;
        pos = start + padded;
    }
    Err(ScanError::Limit("tar exceeds 250,000 entries"))
}

pub(crate) fn is_header(header: &[u8]) -> bool {
    header.len() == BLOCK
        && matches!(&header[257..263], b"ustar\0" | b"ustar ")
        && check_header(header).is_ok()
}

fn check_header(header: &[u8]) -> Result<()> {
    let expected = number(&header[148..156])?;
    let actual = header[..148]
        .iter()
        .chain(&header[156..])
        .map(|byte| *byte as u64)
        .sum::<u64>()
        + 8 * b' ' as u64;
    if actual != expected {
        return Err(ScanError::Invalid("tar header checksum"));
    }
    Ok(())
}

fn number(bytes: &[u8]) -> Result<u64> {
    let invalid = ScanError::Invalid("tar numeric field");
    if bytes[0] == 0x80 {
        // GNU base-256 positive value.
        bytes[1..].iter().try_fold(0_u64, |n, byte| {
            n.checked_mul(256)
                .and_then(|n| n.checked_add(*byte as u64))
                .ok_or_else(|| invalid.clone())
        })
    } else {
        let digits = std::str::from_utf8(bytes)
            .map_err(|_| invalid.clone())?
            .trim_matches(|c| c == '\0' || c == ' ');
        if digits.is_empty() {
            Ok(0)
        } else {
            u64::from_str_radix(digits, 8).map_err(|_| invalid)
        }
    }
}

fn text(field: &[u8]) -> Option<String> {
    let end = field.iter().position(|b| *b == 0).unwrap_or(field.len());
    std::str::from_utf8(&field[..end]).ok().map(str::to_owned)
}

fn header_path(header: &[u8]) -> Option<String> {
    let name = text(&header[..100])?;
    if &header[257..263] == b"ustar\0" {
        let prefix = text(&header[345..500])?;
        if !prefix.is_empty() {
            return Some(format!("{prefix}/{name}"));
        }
    }
    Some(name)
}

fn parse_pax(mut bytes: &[u8]) -> Result<(Option<String>, Option<u64>)> {
    let invalid = ScanError::Invalid("tar PAX record");
    let mut path = None;
    let mut size = None;
    while !bytes.is_empty() {
        let space = bytes
            .iter()
            .position(|b| *b == b' ')
            .ok_or_else(|| invalid.clone())?;
        let length = std::str::from_utf8(&bytes[..space])
            .ok()
            .and_then(|length| length.parse::<usize>().ok())
            .ok_or_else(|| invalid.clone())?;
        if length <= space + 2 || length > bytes.len() || bytes[length - 1] != b'\n' {
            return Err(invalid);
        }
        let record = &bytes[space + 1..length - 1];
        if let Some(value) = record.strip_prefix(b"path=") {
            path = Some(
                std::str::from_utf8(value)
                    .map_err(|_| invalid.clone())?
                    .to_owned(),
            );
        } else if let Some(value) = record.strip_prefix(b"size=") {
            size = Some(
                std::str::from_utf8(value)
                    .ok()
                    .and_then(|value| value.parse().ok())
                    .ok_or_else(|| invalid.clone())?,
            );
        }
        bytes = &bytes[length..];
    }
    Ok((path, size))
}

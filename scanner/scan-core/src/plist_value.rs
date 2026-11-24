use crate::{Result, ScanError, be64};
use plist::{
    Value,
    stream::{Event, Reader},
};
use std::io::Cursor;

const MAX_DEPTH: usize = 64;
const MAX_EVENTS: u64 = 128 * 1024;
const MAX_SCALAR_BYTES: usize = 16 * 1024 * 1024;
const NESTING: ScanError = ScanError::Invalid("property list nesting exceeds 64 collections");
const WORK: ScanError = ScanError::Limit("property list exceeds event or scalar byte limit");

pub(crate) fn parse(bytes: &[u8], invalid: ScanError) -> Result<Value> {
    if bytes.starts_with(b"bplist00") {
        check_binary_counts(bytes, &invalid)?;
    }
    let mut depth = 0usize;
    let mut events = 0;
    let mut children = 0;
    let mut scalar_bytes = 0;
    let mut limit = None;
    let reader = Reader::new(Cursor::new(bytes));
    let guarded = reader.scan((), |_, event| {
        let mut event = match event {
            Ok(event) => event,
            Err(error) => return Some(Err(error)),
        };
        events += 1;
        match &mut event {
            Event::StartArray(count) => {
                depth += 1;
                // Grow the Value builder's arrays only as children arrive.
                children += count.take().unwrap_or(0);
            }
            Event::StartDictionary(count) => {
                depth += 1;
                children += 2 * count.unwrap_or(0);
            }
            Event::EndCollection => depth = depth.saturating_sub(1),
            Event::Data(data) => scalar_bytes += data.len(),
            Event::String(string) => scalar_bytes += string.len(),
            _ => {}
        }
        limit = if depth > MAX_DEPTH {
            Some(NESTING)
        } else if events > MAX_EVENTS || children > MAX_EVENTS || scalar_bytes > MAX_SCALAR_BYTES {
            Some(WORK)
        } else {
            None
        };
        limit.is_none().then_some(Ok(event))
    });
    let value = Value::from_events(guarded);
    match limit {
        Some(error) => Err(error),
        None => value.map_err(|_| invalid),
    }
}

// The binary reader allocates each collection's reference list before it emits
// an event. Check those lengths against the file and the event ceiling first.
fn check_binary_counts(bytes: &[u8], invalid: &ScanError) -> Result<()> {
    let invalid = || invalid.clone();
    let trailer_at = bytes.len().checked_sub(32).ok_or_else(invalid)?;
    let trailer = &bytes[trailer_at..];
    let offset_width = trailer[6] as usize;
    let ref_width = trailer[7] as usize;
    if !matches!(offset_width, 1 | 2 | 3 | 4 | 8) || !matches!(ref_width, 1 | 2 | 3 | 4 | 8) {
        return Err(invalid());
    }
    let count = be64(trailer, 8);
    if count > MAX_EVENTS {
        return Err(WORK);
    }
    let start = usize::try_from(be64(trailer, 24)).map_err(|_| invalid())?;
    let object_bytes = bytes.get(8..start).ok_or_else(invalid)?;
    let table = bytes.get(start..trailer_at).ok_or_else(invalid)?;
    if table.len() / offset_width < count as usize {
        return Err(invalid());
    }
    for offset in table.chunks_exact(offset_width).take(count as usize) {
        let offset = usize::try_from(unsigned(offset)).map_err(|_| invalid())?;
        let (token, rest) = offset
            .checked_sub(8)
            .and_then(|index| object_bytes.get(index..))
            .and_then(<[u8]>::split_first)
            .ok_or_else(invalid)?;
        let multiplier = match token >> 4 {
            0xa => 1,
            0xd => 2,
            _ => continue,
        };
        let (count, refs) = match token & 0xf {
            15 => {
                let (length_tag, rest) = rest.split_first().ok_or_else(invalid)?;
                let width = 1 << (length_tag & 3);
                let (length, refs) = rest.split_at_checked(width).ok_or_else(invalid)?;
                (unsigned(length), refs)
            }
            count => (u64::from(count), rest),
        };
        if count > MAX_EVENTS / multiplier {
            return Err(WORK);
        }
        if (count * multiplier) as usize > refs.len() / ref_width {
            return Err(invalid());
        }
    }
    Ok(())
}

fn unsigned(bytes: &[u8]) -> u64 {
    let mut number = [0; 8];
    number[8 - bytes.len()..].copy_from_slice(bytes);
    u64::from_be_bytes(number)
}

use crate::{Result, ScanError};
use std::{cell::Cell, io::Read};

const STREAM_EXPANSION_RATIO: u64 = 1024;
// Disk images can compress a mostly empty 1 MiB block to 45 bytes with bzip2.
const CHUNK_EXPANSION_RATIO: u64 = 32 * 1024;
const STREAM_RATIO_SLACK: u64 = 64 * 1024;
const MAX_DECODER_STARTS: usize = 512;
const DECODE_LIMIT: ScanError = ScanError::WorkLimit("decoded-byte budget reached");
const RATIO_LIMIT: ScanError = ScanError::WorkLimit("compression expansion ratio exceeded");

pub(crate) struct DecodeBudget {
    limit: u64,
    used: Cell<u64>,
    starts: Cell<usize>,
}

impl DecodeBudget {
    pub(crate) fn new(bytes: u64) -> Self {
        Self {
            limit: bytes,
            used: Cell::new(0),
            starts: Cell::new(0),
        }
    }

    pub(crate) fn used(&self) -> u64 {
        self.used.get()
    }

    pub(crate) fn require(&self, bytes: u64) -> Result<()> {
        if bytes > self.limit - self.used() {
            return Err(DECODE_LIMIT);
        }
        Ok(())
    }

    pub(crate) fn charge(&self, bytes: u64) -> Result<()> {
        self.require(bytes)?;
        self.used.set(self.used() + bytes);
        Ok(())
    }

    pub(crate) fn check_chunk(&self, packed: u64, expanded: u64) -> Result<()> {
        check_chunk_ratio(packed, expanded)?;
        self.require(expanded)
    }

    pub(crate) fn start(&self) -> Result<()> {
        if self.starts.get() == MAX_DECODER_STARTS {
            return Err(ScanError::WorkLimit("too many decoder starts"));
        }
        self.starts.set(self.starts.get() + 1);
        Ok(())
    }

    pub(crate) fn start_chunk(&self, expanded: u64) -> Result<()> {
        self.start()?;
        self.charge(expanded)
    }
}

// Check streaming prefixes against consumed input, with room for lookahead and
// output buffered by the codec. Callers feed at most this much output per step.
pub(crate) const STEP: usize = 16 * 1024;

pub(crate) fn check_stream_ratio(consumed: u64, expanded: u64) -> Result<()> {
    check_ratio(
        consumed,
        expanded,
        STREAM_EXPANSION_RATIO,
        STREAM_RATIO_SLACK,
    )
}

pub(crate) fn check_chunk_ratio(consumed: u64, expanded: u64) -> Result<()> {
    check_ratio(consumed, expanded, CHUNK_EXPANSION_RATIO, 0)
}

fn check_ratio(packed: u64, expanded: u64, ratio: u64, slack: u64) -> Result<()> {
    if expanded > packed.saturating_mul(ratio).saturating_add(slack) {
        return Err(RATIO_LIMIT);
    }
    Ok(())
}

pub(crate) fn zlib(input: &[u8], size: usize, invalid: ScanError) -> Result<Vec<u8>> {
    let mut decoder = flate2::read::ZlibDecoder::new(input);
    let out = exact(&mut decoder, size, invalid)?;
    check_chunk_ratio(decoder.total_in(), size as u64)?;
    Ok(out)
}

pub(crate) fn exact(reader: &mut impl Read, size: usize, invalid: ScanError) -> Result<Vec<u8>> {
    let mut output = vec![0; size];
    reader
        .read_exact(&mut output)
        .map_err(|_| invalid.clone())?;
    if reader.read(&mut [0]).map_err(|_| invalid.clone())? != 0 {
        return Err(invalid);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_ratio_allows_bounded_lookahead_and_counts_consumed_input() {
        assert!(check_stream_ratio(1, STREAM_RATIO_SLACK + STREAM_EXPANSION_RATIO).is_ok());
        assert!(matches!(
            check_stream_ratio(1, STREAM_RATIO_SLACK + STREAM_EXPANSION_RATIO + 1),
            Err(ScanError::WorkLimit(_))
        ));
    }
}

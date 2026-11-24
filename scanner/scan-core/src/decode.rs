use crate::{Result, ScanError};
use std::{cell::Cell, io::Read};

const STREAM_EXPANSION_RATIO: u64 = 1024;
// Disk images can compress a mostly empty 1 MiB block to 45 bytes with bzip2.
const CHUNK_EXPANSION_RATIO: u64 = 32 * 1024;
const STREAM_RATIO_SLACK: u64 = 64 * 1024;
const MAX_DECODER_STARTS: usize = 512;
const STREAM_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024 * 1024;
const DECODE_LIMIT: ScanError = ScanError::WorkLimit("decoded-byte budget reached");
const RATIO_LIMIT: ScanError = ScanError::WorkLimit("compression expansion ratio exceeded");

pub(crate) struct DecodeBudget<'a> {
    strict: bool,
    expired: Option<&'a dyn Fn() -> bool>,
    limit: u64,
    used: Cell<u64>,
    starts: Cell<usize>,
}

impl<'a> DecodeBudget<'a> {
    #[cfg(test)]
    pub(crate) fn new(bytes: u64) -> Self {
        Self::with_limits(bytes, true, None)
    }

    pub(crate) fn with_limits(
        bytes: u64,
        strict: bool,
        expired: Option<&'a dyn Fn() -> bool>,
    ) -> Self {
        Self {
            strict,
            expired,
            limit: bytes,
            used: Cell::new(0),
            starts: Cell::new(0),
        }
    }

    pub(crate) fn used(&self) -> u64 {
        self.used.get()
    }

    pub(crate) fn archive_entry_limit(&self) -> u64 {
        if self.strict { 250_000 } else { u64::MAX }
    }

    pub(crate) fn stream_limit(&self) -> u64 {
        if self.strict {
            STREAM_OUTPUT_LIMIT
        } else {
            u64::MAX
        }
    }

    pub(crate) fn strict(&self) -> bool {
        self.strict
    }

    pub(crate) fn check_deadline(&self) -> Result<()> {
        check_deadline(self.expired)
    }

    pub(crate) fn remaining(&self) -> u64 {
        self.limit - self.used()
    }

    pub(crate) fn require(&self, bytes: u64) -> Result<()> {
        self.check_deadline()?;
        if bytes > self.remaining() {
            return Err(DECODE_LIMIT);
        }
        Ok(())
    }

    pub(crate) fn charge(&self, bytes: u64) -> Result<()> {
        if bytes > self.remaining() {
            return Err(DECODE_LIMIT);
        }
        self.used.set(self.used() + bytes);
        self.check_deadline()
    }

    pub(crate) fn check_chunk(&self, packed: u64, expanded: u64) -> Result<()> {
        self.check_chunk_ratio(packed, expanded)?;
        self.require(expanded)
    }

    pub(crate) fn check_chunk_ratio(&self, packed: u64, expanded: u64) -> Result<()> {
        if self.strict {
            check_chunk_ratio(packed, expanded)?;
        }
        Ok(())
    }

    pub(crate) fn check_stream_ratio(&self, packed: u64, expanded: u64) -> Result<()> {
        if self.strict {
            check_stream_ratio(packed, expanded)?;
        }
        Ok(())
    }

    pub(crate) fn start(&self) -> Result<()> {
        if self.strict {
            if self.starts.get() == MAX_DECODER_STARTS {
                return Err(ScanError::WorkLimit("too many decoder starts"));
            }
            self.starts.set(self.starts.get() + 1);
        }
        self.check_deadline()
    }

    pub(crate) fn start_chunk(&self, expanded: u64) -> Result<()> {
        self.start()?;
        self.charge(expanded)
    }
}

pub(crate) fn check_deadline(expired: Option<&dyn Fn() -> bool>) -> Result<()> {
    if expired.is_some_and(|expired| expired()) {
        return Err(ScanError::WorkLimit("scan deadline reached"));
    }
    Ok(())
}

// Check streaming prefixes against consumed input, with room for lookahead and
// output buffered by the codec. Callers feed at most this much output per step.
pub(crate) const STEP: usize = 16 * 1024;

fn check_stream_ratio(consumed: u64, expanded: u64) -> Result<()> {
    check_ratio(
        consumed,
        expanded,
        STREAM_EXPANSION_RATIO,
        STREAM_RATIO_SLACK,
    )
}

fn check_chunk_ratio(consumed: u64, expanded: u64) -> Result<()> {
    check_ratio(consumed, expanded, CHUNK_EXPANSION_RATIO, 0)
}

fn check_ratio(packed: u64, expanded: u64, ratio: u64, slack: u64) -> Result<()> {
    if expanded > packed.saturating_mul(ratio).saturating_add(slack) {
        return Err(RATIO_LIMIT);
    }
    Ok(())
}

pub(crate) fn zlib(
    input: &[u8],
    size: usize,
    invalid: ScanError,
    work: &DecodeBudget<'_>,
) -> Result<Vec<u8>> {
    let mut decoder = flate2::read::ZlibDecoder::new(input);
    let out = exact(&mut decoder, size, invalid, work)?;
    work.check_chunk_ratio(decoder.total_in(), size as u64)?;
    Ok(out)
}

pub(crate) fn exact(
    reader: &mut impl Read,
    size: usize,
    invalid: ScanError,
    work: &DecodeBudget<'_>,
) -> Result<Vec<u8>> {
    // A declared length bounds the result. Grow the buffer only after the
    // codec actually produces bytes, so an untrusted header cannot size it.
    let mut output = Vec::new();
    let mut scratch = [0; STEP];
    while output.len() < size {
        work.check_deadline()?;
        let count = (size - output.len()).min(STEP);
        reader
            .read_exact(&mut scratch[..count])
            .map_err(|_| invalid.clone())?;
        append_output(&mut output, &scratch[..count])?;
    }
    if reader.read(&mut [0]).map_err(|_| invalid.clone())? != 0 {
        return Err(invalid);
    }
    work.check_deadline()?;
    Ok(output)
}

pub(crate) fn append_output(output: &mut Vec<u8>, bytes: &[u8]) -> Result<()> {
    output
        .try_reserve(bytes.len())
        .map_err(|_| ScanError::Limit("decoded buffer could not be allocated"))?;
    output.extend_from_slice(bytes);
    Ok(())
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

use crate::{ReadAt, Result, ScanError, check_range};
use flate2::{Decompress, FlushDecompress, Status};

const INPUT_CHUNK: u64 = 64 * 1024;
pub(crate) const STREAM_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024 * 1024;

/// A forward-only virtual file backed by a raw DEFLATE stream. Skips
/// decompress into scratch space, so distant fat slices do not need storage.
pub(crate) struct Inflate<S> {
    source: S,
    decoder: Decompress,
    input: Vec<u8>,
    input_start: u64,
    size: u64,
    ended: bool,
}

impl<S: ReadAt> Inflate<S> {
    pub(crate) fn new(source: S, size: u64) -> Self {
        Self {
            source,
            decoder: Decompress::new(false),
            input: Vec::new(),
            input_start: 0,
            size,
            ended: false,
        }
    }

    pub(crate) fn position(&self) -> u64 {
        self.decoder.total_out()
    }

    pub(crate) async fn advance(&mut self, offset: u64) -> Result<()> {
        if offset < self.position() {
            return Err(ScanError::Invalid("backward read from a DEFLATE stream"));
        }
        if offset > STREAM_OUTPUT_LIMIT {
            return Err(ScanError::Limit("DEFLATE traversal exceeds 4 GiB"));
        }
        let mut scratch = [0; 16 * 1024];
        while self.position() < offset {
            let count = (offset - self.position()).min(scratch.len() as u64) as usize;
            self.fill(&mut scratch[..count]).await?;
        }
        Ok(())
    }

    async fn fill(&mut self, mut buffer: &mut [u8]) -> Result<()> {
        while !buffer.is_empty() {
            if self.ended {
                return Err(ScanError::Invalid("DEFLATE ended before requested output"));
            }
            let before_in = self.decoder.total_in();
            let before_out = self.decoder.total_out();
            let index = (before_in - self.input_start) as usize;
            // Give the decoder a chance to emit already-buffered output before
            // requesting another compressed range, especially at a budget edge.
            let status = self
                .decoder
                .decompress(&self.input[index..], buffer, FlushDecompress::None)
                .map_err(|_| ScanError::Invalid("DEFLATE stream"))?;
            self.ended = status == Status::StreamEnd;
            let written = (self.decoder.total_out() - before_out) as usize;
            buffer = &mut buffer[written..];
            if self.decoder.total_in() != before_in || written != 0 || self.ended {
                continue;
            }

            let remaining = self.source.size() - before_in;
            if remaining == 0 {
                return Err(ScanError::Invalid("truncated DEFLATE stream"));
            }
            let unconsumed = &self.input[index..];
            let len = (remaining - unconsumed.len() as u64)
                .min(INPUT_CHUNK.saturating_sub(unconsumed.len() as u64))
                .min(self.source.remaining_budget());
            if len == 0 {
                return Err(if self.source.remaining_budget() == 0 {
                    ScanError::Budget
                } else {
                    ScanError::Invalid("DEFLATE decoder made no progress")
                });
            }

            let next = self
                .source
                .read_at(before_in + unconsumed.len() as u64, len as usize)
                .await?;
            self.input = [unconsumed, &next].concat();
            self.input_start = before_in;
        }
        Ok(())
    }
}

impl<S: ReadAt> ReadAt for Inflate<S> {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        if offset + len as u64 > STREAM_OUTPUT_LIMIT {
            return Err(ScanError::Limit("DEFLATE traversal exceeds 4 GiB"));
        }
        self.advance(offset).await?;
        let mut data = vec![0; len];
        self.fill(&mut data).await?;
        Ok(data)
    }
}

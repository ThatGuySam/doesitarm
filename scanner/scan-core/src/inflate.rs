use crate::{
    ReadAt, Result, ScanError, check_range,
    decode::{DecodeBudget, STEP, check_stream_ratio},
};
use flate2::{Decompress, FlushDecompress, Status};

const INPUT_CHUNK: u64 = 64 * 1024;
pub(crate) const STREAM_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024 * 1024;

/// A forward-only virtual file backed by a raw DEFLATE stream. Skips
/// decompress into scratch space, so distant fat slices do not need storage.
pub(crate) struct Inflate<'a, S> {
    source: S,
    decoder: Decompress,
    input: Vec<u8>,
    input_start: u64,
    size: u64,
    ended: bool,
    work: &'a mut DecodeBudget,
}

impl<'a, S: ReadAt> Inflate<'a, S> {
    pub(crate) fn new(source: S, size: u64, work: &'a mut DecodeBudget) -> Result<Self> {
        Self::with_decoder(source, size, Decompress::new(false), work)
    }

    pub(crate) fn gzip(source: S, work: &'a mut DecodeBudget) -> Result<Self> {
        Self::with_decoder(source, STREAM_OUTPUT_LIMIT, Decompress::new_gzip(15), work)
    }

    fn with_decoder(
        source: S,
        size: u64,
        decoder: Decompress,
        work: &'a mut DecodeBudget,
    ) -> Result<Self> {
        work.start()?;
        Ok(Self {
            source,
            decoder,
            input: Vec::new(),
            input_start: 0,
            size,
            ended: false,
            work,
        })
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
        self.work.require(offset - self.position())?;
        let mut scratch = [0; STEP];
        while self.position() < offset {
            let count = (offset - self.position()).min(scratch.len() as u64) as usize;
            self.fill(&mut scratch[..count]).await?;
        }
        Ok(())
    }

    async fn fill(&mut self, mut buffer: &mut [u8]) -> Result<()> {
        self.work.require(buffer.len() as u64)?;
        while !buffer.is_empty() {
            if self.ended {
                return Err(ScanError::Invalid("DEFLATE ended before requested output"));
            }
            let before_in = self.decoder.total_in();
            let before_out = self.decoder.total_out();
            let index = (before_in - self.input_start) as usize;
            // Give the decoder a chance to emit already-buffered output before
            // requesting another compressed range, especially at a budget edge.
            let count = buffer.len().min(STEP);
            let status = self.decoder.decompress(
                &self.input[index..],
                &mut buffer[..count],
                FlushDecompress::None,
            );
            let written = (self.decoder.total_out() - before_out) as usize;
            self.work.charge(written as u64)?;
            check_stream_ratio(self.decoder.total_in(), self.decoder.total_out())?;
            self.ended =
                status.map_err(|_| ScanError::Invalid("DEFLATE stream"))? == Status::StreamEnd;
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
                .min(chunk_size(before_in).saturating_sub(unconsumed.len() as u64))
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

impl<S: ReadAt> ReadAt for Inflate<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        if offset + len as u64 > STREAM_OUTPUT_LIMIT {
            return Err(ScanError::Limit("DEFLATE traversal exceeds 4 GiB"));
        }
        self.advance(offset).await?;
        self.work.require(len as u64)?;
        let mut data = vec![0; len];
        self.fill(&mut data).await?;
        Ok(data)
    }
}

pub(crate) fn chunk_size(position: u64) -> u64 {
    if position < INPUT_CHUNK {
        INPUT_CHUNK
    } else if position < 1024 * 1024 {
        4 * INPUT_CHUNK
    } else {
        16 * INPUT_CHUNK
    }
}

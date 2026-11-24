use crate::{
    ReadAt, Result, ScanError, be64, check_range,
    decode::{DecodeBudget, STEP, check_stream_ratio},
    inflate::{STREAM_OUTPUT_LIMIT, chunk_size},
};
use lzma_rust2::{Action, Status, XzStream};
use std::ops::Range;

const BAD_PBZX: ScanError = ScanError::Invalid("PKG PBZX chunk");
const BAD_XZ: ScanError = ScanError::Invalid("PKG PBZX XZ stream");

pub(crate) struct Pbzx<'a, S> {
    source: S,
    block_size: u64,
    next_packed: u64,
    next_logical: u64,
    chunk: Option<Chunk>,
    count: usize,
    work: &'a mut DecodeBudget,
}

struct Chunk {
    logical: Range<u64>,
    packed: Range<u64>,
    decoder: Option<XzPrefix>,
}

impl<'a, S: ReadAt> Pbzx<'a, S> {
    pub(crate) async fn open(mut source: S, work: &'a mut DecodeBudget) -> Result<Self> {
        let header = source.read_at(0, 12).await?;
        let block_size = be64(&header, 4);
        if &header[..4] != b"pbzx" || block_size == 0 {
            return Err(BAD_PBZX);
        }
        if block_size > 32 * 1024 * 1024 {
            return Err(ScanError::Limit("PKG PBZX block exceeds 32 MiB"));
        }
        Ok(Self {
            source,
            block_size,
            next_packed: 12,
            next_logical: 0,
            chunk: None,
            count: 0,
            work,
        })
    }

    async fn next(&mut self) -> Result<Chunk> {
        self.count += 1;
        if self.count > 4096 {
            return Err(ScanError::Limit("PKG PBZX exceeds 4096 chunks"));
        }
        let header = self.source.read_at(self.next_packed, 16).await?;
        let expanded = be64(&header, 0);
        let packed = be64(&header, 8);
        if expanded == 0 || expanded > self.block_size || packed == 0 || packed > expanded {
            return Err(BAD_PBZX);
        }
        let at = self.next_packed + 16;
        check_range(self.source.size(), at, packed)?;
        let end = self.next_logical + expanded;
        if end > STREAM_OUTPUT_LIMIT {
            return Err(ScanError::Limit("PKG PBZX traversal exceeds 4 GiB"));
        }
        let result = Chunk {
            logical: self.next_logical..end,
            packed: at..at + packed,
            decoder: None,
        };
        self.next_packed = at + packed;
        self.next_logical = end;
        Ok(result)
    }
}

impl<S: ReadAt> ReadAt for Pbzx<'_, S> {
    fn size(&self) -> u64 {
        STREAM_OUTPUT_LIMIT
    }

    async fn read_at(&mut self, mut offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size(), offset, len as u64)?;
        let mut bytes = vec![0; len];
        let mut written = 0;
        while written < len {
            while self
                .chunk
                .as_ref()
                .is_none_or(|chunk| offset >= chunk.logical.end)
            {
                // The length header is enough to skip an unneeded compressed
                // block without loading or decoding it.
                self.chunk = Some(self.next().await?);
            }
            let chunk = self.chunk.as_mut().unwrap();
            let within = offset.checked_sub(chunk.logical.start).ok_or(BAD_PBZX)?;
            let count = ((chunk.logical.end - offset) as usize).min(len - written);
            let output = &mut bytes[written..written + count];
            if chunk.logical.end - chunk.logical.start == chunk.packed.end - chunk.packed.start {
                let data = self
                    .source
                    .read_at(chunk.packed.start + within, count)
                    .await?;
                output.copy_from_slice(&data);
            } else {
                if chunk.decoder.is_none() {
                    self.work.start()?;
                }
                let decoder = chunk
                    .decoder
                    .get_or_insert_with(|| XzPrefix::new(chunk.packed.clone()));
                decoder
                    .read(&mut self.source, self.work, within, output)
                    .await?;
            }
            offset += count as u64;
            written += count;
        }
        Ok(bytes)
    }
}

struct XzPrefix {
    decoder: XzStream,
    range: Range<u64>,
    input: Vec<u8>,
    input_start: u64,
    ended: bool,
}

impl XzPrefix {
    fn new(range: Range<u64>) -> Self {
        Self {
            decoder: XzStream::new_mem_limit(false, 32 * 1024),
            range,
            input: Vec::new(),
            input_start: 0,
            ended: false,
        }
    }

    async fn read(
        &mut self,
        source: &mut impl ReadAt,
        work: &mut DecodeBudget,
        at: u64,
        output: &mut [u8],
    ) -> Result<()> {
        let here = self.decoder.total_out();
        if at < here {
            return Err(ScanError::Invalid("backward read from a PBZX XZ stream"));
        }
        work.require(at - here + output.len() as u64)?;
        if at > here {
            let mut scratch = [0; STEP];
            while self.decoder.total_out() < at {
                let count = (at - self.decoder.total_out()).min(scratch.len() as u64) as usize;
                self.fill(source, work, &mut scratch[..count]).await?;
            }
        }
        self.fill(source, work, output).await
    }

    async fn fill(
        &mut self,
        source: &mut impl ReadAt,
        work: &mut DecodeBudget,
        mut output: &mut [u8],
    ) -> Result<()> {
        while !output.is_empty() {
            if self.ended {
                return Err(BAD_XZ);
            }
            let before = self.decoder.total_in();
            let before_out = self.decoder.total_out();
            let index = (before - self.input_start) as usize;
            let unconsumed = &self.input[index..];
            let available = self.range.end - self.range.start - before - unconsumed.len() as u64;
            let action = if available == 0 {
                Action::Finish
            } else {
                Action::Run
            };
            let count = output.len().min(STEP);
            let update = self
                .decoder
                .process(unconsumed, &mut output[..count], action);
            work.charge(self.decoder.total_out() - before_out)?;
            check_stream_ratio(self.decoder.total_in(), self.decoder.total_out())?;
            let update = update.map_err(|_| BAD_XZ)?;
            self.ended = update.status == Status::StreamEnd;
            output = &mut output[update.bytes_produced..];
            if update.bytes_consumed != 0 || update.bytes_produced != 0 || self.ended {
                continue;
            }
            let length = available
                .min(chunk_size(before).saturating_sub(unconsumed.len() as u64))
                .min(source.remaining_budget());
            if length == 0 {
                return Err(if available != 0 && source.remaining_budget() == 0 {
                    ScanError::Budget
                } else {
                    BAD_XZ
                });
            }
            let offset = self.range.start + before + unconsumed.len() as u64;
            let next = source.read_at(offset, length as usize).await?;
            self.input = [unconsumed, &next].concat();
            self.input_start = before;
        }
        Ok(())
    }
}

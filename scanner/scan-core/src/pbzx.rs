use crate::{
    ReadAt, Result, ScanError, be64, check_range,
    inflate::{Codec, STREAM_OUTPUT_LIMIT, Stream},
};
use lzma_rust2::{Action, Status, XzStream};
use std::ops::Range;

const BAD_PBZX: ScanError = ScanError::Invalid("PKG PBZX chunk");
const BAD_XZ: ScanError = ScanError::Invalid("PKG PBZX XZ stream");

pub(crate) struct Pbzx<S> {
    source: S,
    block_size: u64,
    next_packed: u64,
    next_logical: u64,
    chunk: Option<Chunk>,
    count: usize,
}

struct Chunk {
    logical: Range<u64>,
    packed: Range<u64>,
    decoder: Option<Stream>,
}

impl<S: ReadAt> Pbzx<S> {
    pub(crate) async fn open(mut source: S) -> Result<Self> {
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

    pub(crate) async fn tail(&mut self) -> Result<Option<(u64, Vec<u8>)>> {
        while self.next_packed < self.source.size() {
            let chunk = self.next().await?;
            if self.next_packed != self.source.size() {
                continue;
            }
            let packed = chunk.packed.end - chunk.packed.start;
            let expanded = chunk.logical.end - chunk.logical.start;
            if packed > 4 * 1024 * 1024
                || expanded > 16 * 1024 * 1024
                || packed > self.source.remaining_budget() / 2
            {
                return Ok(None);
            }
            let bytes = self
                .source
                .read_at(chunk.packed.start, packed as usize)
                .await?;
            let data = if packed == expanded {
                bytes
            } else {
                let mut decoder = XzStream::new_mem_limit(false, 32 * 1024);
                let mut decoded = vec![0; expanded as usize + 1];
                let update = decoder
                    .process(&bytes, &mut decoded, Action::Finish)
                    .map_err(|_| BAD_XZ)?;
                if update.status != Status::StreamEnd
                    || update.bytes_consumed != bytes.len()
                    || update.bytes_produced != expanded as usize
                {
                    return Err(BAD_XZ);
                }
                decoded.truncate(expanded as usize);
                decoded
            };
            let tail_len = data.len().min(512 * 1024);
            return Ok(Some((
                chunk.logical.end - tail_len as u64,
                data[data.len() - tail_len..].to_vec(),
            )));
        }
        Ok(None)
    }
}

impl<S: ReadAt> ReadAt for Pbzx<S> {
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
                let decoder = chunk
                    .decoder
                    .get_or_insert_with(|| Stream::new(chunk.packed.clone(), Codec::Xz));
                decoder.read(&mut self.source, within, output).await?;
            }
            offset += count as u64;
            written += count;
        }
        Ok(bytes)
    }
}

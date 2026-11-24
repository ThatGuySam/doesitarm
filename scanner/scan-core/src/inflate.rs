use crate::{ReadAt, Result, ScanError, check_range};
use flate2::{Decompress, FlushDecompress};
use lzma_rust2::{Action, XzStream};
use std::ops::Range;

const INPUT_CHUNK: u64 = 64 * 1024;
pub(crate) const STREAM_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Clone, Copy)]
pub(crate) enum Codec {
    Deflate,
    Gzip,
    Bzip2,
    Xz,
    Lzma,
}

impl Codec {
    pub(crate) fn from_magic(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(b"\x1f\x8b") {
            Some(Self::Gzip)
        } else if bytes.starts_with(b"BZh") {
            Some(Self::Bzip2)
        } else if bytes.starts_with(b"\xfd7zXZ\0") {
            Some(Self::Xz)
        } else {
            None
        }
    }

    fn stream(self) -> Decoder {
        match self {
            Self::Deflate => Decoder::Deflate(Decompress::new(false)),
            Self::Gzip => Decoder::Deflate(Decompress::new_gzip(15)),
            Self::Bzip2 => Decoder::Bzip2(bzip2::Decompress::new(false)),
            Self::Xz => Decoder::Xz(Box::new(XzStream::new_mem_limit(true, 32 * 1024))),
            Self::Lzma => Decoder::Lzma(Box::new(lzma_rust2::LzmaStream::new_mem_limit(
                32 * 1024,
                None,
            ))),
        }
    }
}

enum Decoder {
    Deflate(Decompress),
    Bzip2(bzip2::Decompress),
    Xz(Box<XzStream>),
    Lzma(Box<lzma_rust2::LzmaStream>),
}

struct Progress {
    consumed: usize,
    produced: usize,
    ended: bool,
}

impl Decoder {
    fn process(&mut self, input: &[u8], output: &mut [u8], finished: bool) -> Result<Progress> {
        let action = if finished {
            Action::Finish
        } else {
            Action::Run
        };
        match self {
            Self::Deflate(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let status = decoder
                    .decompress(input, output, FlushDecompress::None)
                    .map_err(|_| ScanError::Invalid("DEFLATE stream"))?;
                Ok(Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended: status == flate2::Status::StreamEnd,
                })
            }
            Self::Bzip2(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let status = decoder
                    .decompress(input, output)
                    .map_err(|_| ScanError::Invalid("bzip2 stream"))?;
                Ok(Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended: status == bzip2::Status::StreamEnd,
                })
            }
            Self::Xz(decoder) => {
                let progress = decoder
                    .process(input, output, action)
                    .map_err(|_| ScanError::Invalid("XZ stream"))?;
                Ok(Progress {
                    consumed: progress.bytes_consumed,
                    produced: progress.bytes_produced,
                    ended: progress.status == lzma_rust2::Status::StreamEnd,
                })
            }
            Self::Lzma(decoder) => {
                let progress = decoder
                    .process(input, output, action)
                    .map_err(|_| ScanError::Invalid("LZMA stream"))?;
                Ok(Progress {
                    consumed: progress.bytes_consumed,
                    produced: progress.bytes_produced,
                    ended: progress.status == lzma_rust2::Status::StreamEnd,
                })
            }
        }
    }
}

/// A forward-only virtual file with bounded read-ahead and discard of unwanted decoded bytes.
pub(crate) struct Forward<S> {
    source: S,
    stream: Stream,
    size: u64,
}

impl<S: ReadAt> Forward<S> {
    pub(crate) fn new(source: S, size: u64, codec: Codec) -> Self {
        let stream = Stream::new(0..source.size(), codec);
        Self {
            source,
            stream,
            size,
        }
    }
}

impl<S: ReadAt> ReadAt for Forward<S> {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        let mut data = vec![0; len];
        self.stream
            .read(&mut self.source, offset, &mut data)
            .await?;
        Ok(data)
    }
}

pub(crate) struct Stream {
    range: Range<u64>,
    decoder: Decoder,
    input: Vec<u8>,
    consumed: usize,
    fetched: u64,
    decoded: u64,
    ended: bool,
}

impl Stream {
    pub(crate) fn new(range: Range<u64>, codec: Codec) -> Self {
        Self {
            range,
            decoder: codec.stream(),
            input: Vec::new(),
            consumed: 0,
            fetched: 0,
            decoded: 0,
            ended: false,
        }
    }

    pub(crate) async fn read(
        &mut self,
        source: &mut impl ReadAt,
        offset: u64,
        buffer: &mut [u8],
    ) -> Result<()> {
        if offset < self.decoded {
            return Err(ScanError::Invalid("backward read from a compressed stream"));
        }
        if offset > STREAM_OUTPUT_LIMIT || buffer.len() as u64 > STREAM_OUTPUT_LIMIT - offset {
            return Err(ScanError::Limit(
                "compressed stream traversal exceeds 4 GiB",
            ));
        }
        let mut scratch = [0; 16 * 1024];
        while self.decoded < offset {
            let count = (offset - self.decoded).min(scratch.len() as u64) as usize;
            self.fill(source, &mut scratch[..count]).await?;
        }
        self.fill(source, buffer).await
    }

    async fn fill(&mut self, source: &mut impl ReadAt, mut output: &mut [u8]) -> Result<()> {
        let packed = self.range.end - self.range.start;
        while !output.is_empty() {
            if self.ended {
                return Err(ScanError::Invalid(
                    "compressed stream ended before requested output",
                ));
            }
            let unconsumed = &self.input[self.consumed..];
            let update = self
                .decoder
                .process(unconsumed, output, self.fetched == packed)?;
            self.ended = update.ended;
            self.consumed += update.consumed;
            self.decoded += update.produced as u64;
            output = &mut output[update.produced..];
            if self.ended || update.consumed != 0 || update.produced != 0 {
                continue;
            }

            let available = packed - self.fetched;
            if available == 0 {
                return Err(ScanError::Invalid("truncated compressed stream"));
            }
            let length = available
                .min(chunk_size(self.fetched).saturating_sub(unconsumed.len() as u64))
                .min(source.remaining_budget());
            if length == 0 {
                return Err(if source.remaining_budget() == 0 {
                    ScanError::Budget
                } else {
                    ScanError::Invalid("compressed decoder made no progress")
                });
            }
            let next = source
                .read_at(self.range.start + self.fetched, length as usize)
                .await?;
            self.input = [unconsumed, &next].concat();
            self.consumed = 0;
            self.fetched += length;
        }
        Ok(())
    }
}

fn chunk_size(position: u64) -> u64 {
    if position < INPUT_CHUNK {
        INPUT_CHUNK
    } else if position < 1024 * 1024 {
        4 * INPUT_CHUNK
    } else if position < 8 * 1024 * 1024 {
        16 * INPUT_CHUNK
    } else {
        64 * INPUT_CHUNK
    }
}

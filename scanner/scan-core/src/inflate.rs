use crate::{
    ReadAt, Result, ScanError, check_range,
    decode::{DecodeBudget, STEP, append_output},
};
use flate2::{Decompress, FlushDecompress};
use lzma_rust2::{Action, XzStream};
use std::ops::Range;
mod zstd;
pub(crate) use zstd::is_magic as zstd_magic;

const INPUT_CHUNK: u64 = 64 * 1024;

#[derive(Clone, Copy)]
pub(crate) enum Codec {
    Deflate,
    Gzip,
    Bzip2,
    Xz,
    Lzma,
    Zstd,
    RawLzma {
        size: u64,
        properties: u8,
        dictionary: u32,
    },
    Lzma2(u32),
}

impl Codec {
    pub(crate) fn from_magic(bytes: &[u8]) -> Option<Self> {
        if bytes.starts_with(b"\x1f\x8b") {
            Some(Self::Gzip)
        } else if bytes.starts_with(b"BZh") {
            Some(Self::Bzip2)
        } else if bytes.starts_with(b"\xfd7zXZ\0") {
            Some(Self::Xz)
        } else if zstd::is_magic(bytes) {
            Some(Self::Zstd)
        } else {
            None
        }
    }

    fn stream(self, work: &DecodeBudget<'_>) -> Result<Decoder> {
        let memory = work.lzma_memory_kib();
        Ok(match self {
            Self::Deflate => Decoder::Deflate(Decompress::new(false)),
            Self::Gzip => Decoder::Deflate(Decompress::new_gzip(15)),
            Self::Bzip2 => Decoder::Bzip2 {
                decoder: bzip2::Decompress::new(false),
                at_member_end: false,
            },
            Self::Xz => Decoder::Xz(Box::new(XzStream::new_mem_limit(true, memory))),
            Self::Lzma => Decoder::Lzma(Box::new(lzma_rust2::LzmaStream::new_mem_limit(
                memory, None,
            ))),
            Self::Zstd => Decoder::Zstd(Box::new(zstd::Decoder::new(work))),
            Self::RawLzma {
                size,
                properties,
                dictionary,
            } => {
                let need = lzma_rust2::lzma_get_memory_usage_by_props(dictionary, properties)
                    .map_err(|_| ScanError::Invalid("raw LZMA properties"))?;
                if need > memory {
                    return Err(LZMA_LIMIT);
                }
                Decoder::Lzma(Box::new(
                    lzma_rust2::LzmaStream::new_with_props(size, properties, dictionary, None)
                        .map_err(|_| ScanError::Invalid("raw LZMA properties"))?,
                ))
            }
            Self::Lzma2(dictionary) => Decoder::Lzma2(Box::new(
                lzma_rust2::Lzma2Stream::new_mem_limit(dictionary, memory),
            )),
        })
    }
}

enum Decoder {
    Deflate(Decompress),
    Bzip2 {
        decoder: bzip2::Decompress,
        at_member_end: bool,
    },
    Xz(Box<XzStream>),
    Lzma(Box<lzma_rust2::LzmaStream>),
    Lzma2(Box<lzma_rust2::Lzma2Stream>),
    Zstd(Box<zstd::Decoder>),
}

const LZMA_LIMIT: ScanError = ScanError::WorkLimit("LZMA decoder memory limit reached");

fn lzma_error(error: std::io::Error, codec: &'static str) -> ScanError {
    if error.kind() == std::io::ErrorKind::OutOfMemory {
        LZMA_LIMIT
    } else {
        ScanError::Invalid(codec)
    }
}

struct Progress {
    consumed: usize,
    produced: usize,
    ended: Result<bool>,
}

impl Decoder {
    fn process(&mut self, input: &[u8], output: &mut [u8], finished: bool) -> Progress {
        let action = if finished {
            Action::Finish
        } else {
            Action::Run
        };
        match self {
            Self::Deflate(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let ended = decoder
                    .decompress(input, output, FlushDecompress::None)
                    .map(|status| status == flate2::Status::StreamEnd)
                    .map_err(|_| ScanError::Invalid("DEFLATE stream"));
                Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended,
                }
            }
            Self::Bzip2 {
                decoder,
                at_member_end,
            } => {
                if *at_member_end {
                    if input.is_empty() {
                        return Progress {
                            consumed: 0,
                            produced: 0,
                            ended: Ok(finished),
                        };
                    }
                    *decoder = bzip2::Decompress::new(false);
                    *at_member_end = false;
                }
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let result = decoder
                    .decompress(input, output)
                    .map_err(|_| ScanError::Invalid("bzip2 stream"));
                *at_member_end = matches!(result, Ok(bzip2::Status::StreamEnd));
                Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended: result.map(|_| false),
                }
            }
            Self::Xz(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let ended = decoder
                    .process(input, output, action)
                    .map(|progress| progress.status == lzma_rust2::Status::StreamEnd)
                    .map_err(|error| lzma_error(error, "XZ stream"));
                Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended,
                }
            }
            Self::Lzma(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let ended = decoder
                    .process(input, output, action)
                    .map(|progress| progress.status == lzma_rust2::Status::StreamEnd)
                    .map_err(|error| lzma_error(error, "LZMA stream"));
                Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended,
                }
            }
            Self::Lzma2(decoder) => {
                let before_in = decoder.total_in();
                let before_out = decoder.total_out();
                let ended = decoder
                    .process(input, output, action)
                    .map(|progress| progress.status == lzma_rust2::Status::StreamEnd)
                    .map_err(|error| lzma_error(error, "LZMA2 stream"));
                Progress {
                    consumed: (decoder.total_in() - before_in) as usize,
                    produced: (decoder.total_out() - before_out) as usize,
                    ended,
                }
            }
            Self::Zstd(decoder) => decoder.process(input, output, finished),
        }
    }
}

/// A forward-only virtual file with bounded read-ahead and discard of unwanted decoded bytes.
pub(crate) struct Forward<'a, S> {
    source: S,
    stream: Stream,
    codec: Codec,
    size: u64,
    work: &'a DecodeBudget<'a>,
}

impl<'a, S: ReadAt> Forward<'a, S> {
    pub(crate) fn new(
        source: S,
        size: u64,
        codec: Codec,
        work: &'a DecodeBudget<'a>,
    ) -> Result<Self> {
        work.start()?;
        let stream = Stream::new(0..source.size(), codec, work)?;
        Ok(Self {
            source,
            stream,
            codec,
            size,
            work,
        })
    }
}

impl<S: ReadAt> Forward<'_, S> {
    pub(crate) fn rewind_for(&mut self, offset: u64) -> Result<()> {
        if offset < self.stream.decoded {
            self.work.start()?;
            self.stream = Stream::new(0..self.source.size(), self.codec, self.work)?;
        }
        Ok(())
    }
}

impl<S: ReadAt> ReadAt for Forward<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.source.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        self.stream.check_read(offset, len, self.work)?;
        self.stream
            .advance(&mut self.source, self.work, offset)
            .await?;
        let mut data = Vec::new();
        let mut scratch = vec![0; len.min(STEP)];
        while data.len() < len {
            let count = (len - data.len()).min(scratch.len());
            self.stream
                .fill(&mut self.source, self.work, &mut scratch[..count])
                .await?;
            append_output(&mut data, &scratch[..count])?;
        }
        Ok(data)
    }
}

pub(crate) struct Stream {
    range: Range<u64>,
    decoder: Decoder,
    input: Vec<u8>,
    consumed: usize,
    total_consumed: u64,
    fetched: u64,
    decoded: u64,
    ended: bool,
}

impl Stream {
    pub(crate) fn new(range: Range<u64>, codec: Codec, work: &DecodeBudget<'_>) -> Result<Self> {
        Ok(Self {
            range,
            decoder: codec.stream(work)?,
            input: Vec::new(),
            consumed: 0,
            total_consumed: 0,
            fetched: 0,
            decoded: 0,
            ended: false,
        })
    }

    fn check_read(&self, offset: u64, len: usize, work: &DecodeBudget<'_>) -> Result<()> {
        if offset < self.decoded {
            return Err(ScanError::Invalid("backward read from a compressed stream"));
        }
        let end = offset
            .checked_add(len as u64)
            .ok_or(ScanError::Invalid("compressed stream offset overflow"))?;
        if end > work.stream_limit() {
            return Err(ScanError::Limit(
                "compressed stream traversal exceeds 4 GiB",
            ));
        }
        work.require(end - self.decoded)
    }

    pub(crate) async fn read(
        &mut self,
        source: &mut impl ReadAt,
        work: &DecodeBudget<'_>,
        offset: u64,
        buffer: &mut [u8],
    ) -> Result<()> {
        self.check_read(offset, buffer.len(), work)?;
        self.advance(source, work, offset).await?;
        self.fill(source, work, buffer).await
    }

    async fn advance(
        &mut self,
        source: &mut impl ReadAt,
        work: &DecodeBudget<'_>,
        offset: u64,
    ) -> Result<()> {
        let mut scratch = vec![0; (offset - self.decoded).min(STEP as u64) as usize];
        while self.decoded < offset {
            let count = (offset - self.decoded).min(scratch.len() as u64) as usize;
            self.fill(source, work, &mut scratch[..count]).await?;
        }
        Ok(())
    }

    async fn fill(
        &mut self,
        source: &mut impl ReadAt,
        work: &DecodeBudget<'_>,
        mut output: &mut [u8],
    ) -> Result<()> {
        let packed = self.range.end - self.range.start;
        while !output.is_empty() {
            work.check_deadline()?;
            if self.ended {
                return Err(ScanError::Invalid(
                    "compressed stream ended before requested output",
                ));
            }
            let unconsumed = &self.input[self.consumed..];
            let count = output.len().min(STEP);
            let update =
                self.decoder
                    .process(unconsumed, &mut output[..count], self.fetched == packed);
            work.charge(update.produced as u64)?;
            self.total_consumed += update.consumed as u64;
            work.check_stream_ratio(self.total_consumed, self.decoded + update.produced as u64)?;
            self.ended = update.ended?;
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

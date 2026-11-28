use super::Progress;
use crate::{Result, ScanError, decode::DecodeBudget, le32};
use ruzstd::decoding::{BlockDecodingStrategy, FrameDecoder};
use std::io::Read;

const FRAME_MAGIC: u32 = 0xfd2f_b528;
const MAX_BLOCK: usize = 128 * 1024;
const INVALID: ScanError = ScanError::Invalid("Zstandard stream");

pub(crate) fn is_magic(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && (le32(bytes, 0) == FRAME_MAGIC || skippable(le32(bytes, 0)))
}

fn skippable(magic: u32) -> bool {
    magic & 0xffff_fff0 == 0x184d_2a50
}

pub(super) struct Decoder {
    frame: FrameDecoder,
    has_frame: bool,
    has_checksum: bool,
    skip: u32,
}

impl Decoder {
    pub(super) fn new(work: &DecodeBudget<'_>) -> Self {
        let mut frame = FrameDecoder::new();
        let mib = if work.strict() { 16 } else { 128 };
        frame.set_max_window_size(mib * 1024 * 1024);
        Self {
            frame,
            has_frame: false,
            has_checksum: false,
            skip: 0,
        }
    }

    pub(super) fn process(&mut self, input: &[u8], output: &mut [u8], finished: bool) -> Progress {
        let mut consumed = 0;
        let mut produced = 0;
        let ended = self.step(input, output, finished, &mut consumed, &mut produced);
        Progress {
            consumed,
            produced,
            ended,
        }
    }

    fn step(
        &mut self,
        input: &[u8],
        output: &mut [u8],
        finished: bool,
        consumed: &mut usize,
        produced: &mut usize,
    ) -> Result<bool> {
        if self.skip != 0 {
            *consumed = (self.skip as usize).min(input.len());
            self.skip -= *consumed as u32;
            return Ok(false);
        }
        if self.has_frame {
            *produced = self.frame.read(output).map_err(|_| INVALID)?;
            if *produced != 0 {
                return Ok(false);
            }
            if self.frame.is_finished() {
                if self
                    .frame
                    .get_checksum_from_data()
                    .is_some_and(|checksum| Some(checksum) != self.frame.get_calculated_checksum())
                {
                    return Err(ScanError::Invalid("Zstandard frame checksum"));
                }
                self.has_frame = false;
            }
        }
        if !self.has_frame {
            if input.len() < 4 {
                return Ok(finished && input.is_empty());
            }
            let magic = le32(input, 0);
            if skippable(magic) {
                if input.len() >= 8 {
                    self.skip = le32(input, 4);
                    *consumed = 8;
                }
                return Ok(false);
            }
            // The frame header fits in 18 bytes. Wait for a complete prefix
            // before handing it to the synchronous decoder.
            if input.len() < 18 && !finished {
                return Ok(false);
            }
            if magic != FRAME_MAGIC || input.len() < 5 {
                return Err(INVALID);
            }
            let mut header = input;
            self.frame.reset(&mut header).map_err(|error| {
                use ruzstd::decoding::errors::FrameDecoderError;
                match error {
                    FrameDecoderError::WindowSizeTooBig { .. } => {
                        ScanError::WorkLimit("Zstandard decoder window limit reached")
                    }
                    FrameDecoderError::DictNotProvided { .. } => {
                        ScanError::Unsupported("Zstandard external dictionary")
                    }
                    _ => INVALID,
                }
            })?;
            *consumed = input.len() - header.len();
            self.has_checksum = input[4] & 4 != 0;
            self.has_frame = true;
            return Ok(false);
        }

        let Some(header) = input.get(..3) else {
            return Ok(false);
        };
        let flags = u32::from_le_bytes([header[0], header[1], header[2], 0]);
        let kind = (flags >> 1) & 3;
        let size = (flags >> 3) as usize;
        if size > MAX_BLOCK || kind == 3 {
            return Err(ScanError::Invalid("Zstandard block header"));
        }
        let packed = if kind == 1 { 1 } else { size };
        let checksum = if flags & 1 != 0 && self.has_checksum {
            4
        } else {
            0
        };
        let Some(byte_range) = input.get(..3 + packed + checksum) else {
            return Ok(false);
        };
        let mut block = byte_range;
        self.frame
            .decode_blocks(&mut block, BlockDecodingStrategy::UptoBlocks(1))
            .map_err(|_| INVALID)?;
        if !block.is_empty() {
            return Err(ScanError::Invalid("Zstandard block size"));
        }
        *consumed = byte_range.len();
        *produced = self.frame.read(output).map_err(|_| INVALID)?;
        Ok(false)
    }
}

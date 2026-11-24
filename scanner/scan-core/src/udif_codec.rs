use crate::{Result, ScanError};
use std::io::{self, Read, Write};

pub(crate) const ZERO: u32 = 0;
pub(crate) const RAW: u32 = 1;
pub(crate) const IGNORE: u32 = 2;
pub(crate) const ADC: u32 = 0x8000_0004;
pub(crate) const ZLIB: u32 = 0x8000_0005;
pub(crate) const BZIP2: u32 = 0x8000_0006;
pub(crate) const LZFSE: u32 = 0x8000_0007;
pub(crate) const LZMA: u32 = 0x8000_0008;
const INVALID: ScanError = ScanError::Invalid("UDIF compressed chunk");

pub(crate) fn decode(kind: u32, input: &[u8], size: usize) -> Result<Vec<u8>> {
    if kind == ADC {
        return adc(input, size);
    }
    if kind == LZFSE {
        let mut out = Bounded(Vec::with_capacity(size), size);
        lzfse_rust::LzfseRingDecoder::default()
            .decode(&mut { input }, &mut out)
            .map_err(|_| INVALID)?;
        return if out.0.len() == size {
            Ok(out.0)
        } else {
            Err(INVALID)
        };
    }

    match kind {
        ZLIB => read_exact(flate2::read::ZlibDecoder::new(input), size),
        BZIP2 => read_exact(bzip2::read::BzDecoder::new(input), size),
        LZMA => {
            // ULMO uses XZ framing and needs a bounded LZMA2 dictionary.
            let reader = lzma_rust2::XzReader::new_mem_limit(input, false, 32 * 1024);
            read_exact(reader, size)
        }
        _ => Err(ScanError::Unsupported("UDIF chunk codec")),
    }
}

fn read_exact(reader: impl Read, size: usize) -> Result<Vec<u8>> {
    let mut bytes = vec![0; size];
    let mut reader = reader;
    reader.read_exact(&mut bytes).map_err(|_| INVALID)?;
    if reader.read(&mut [0]).map_err(|_| INVALID)? != 0 {
        return Err(INVALID);
    }
    Ok(bytes)
}

struct Bounded(Vec<u8>, usize);

impl Write for Bounded {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.1 - self.0.len() {
            return Err(io::Error::other("UDIF chunk expands past declared size"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn adc(mut input: &[u8], size: usize) -> Result<Vec<u8>> {
    let mut out = Vec::with_capacity(size);
    while let Some((&tag, rest)) = input.split_first() {
        input = rest;
        if tag & 0x80 != 0 {
            let count = (tag as usize & 0x7f) + 1;
            if count > input.len() || count > size - out.len() {
                return Err(INVALID);
            }
            out.extend_from_slice(&input[..count]);
            input = &input[count..];
        } else {
            let first = *input.first().ok_or(INVALID)?;
            let (count, distance, consumed) = if tag & 0x40 != 0 {
                let second = *input.get(1).ok_or(INVALID)?;
                (
                    (tag & 0x3f) as usize + 4,
                    u16::from_be_bytes([first, second]) as usize + 1,
                    2,
                )
            } else {
                (
                    (tag >> 2) as usize + 3,
                    u16::from_be_bytes([tag & 3, first]) as usize + 1,
                    1,
                )
            };
            if distance > out.len() || count > size - out.len() {
                return Err(INVALID);
            }
            for _ in 0..count {
                out.push(out[out.len() - distance]);
            }
            input = &input[consumed..];
        }
    }
    if out.len() != size {
        return Err(INVALID);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adc_literals_and_overlapping_matches_obey_declared_size() {
        let encoded = b"\x81ab\x00\x01\x40\x00\x00";
        assert_eq!(decode(ADC, encoded, 9).unwrap(), b"ababaaaaa");
        assert!(decode(ADC, encoded, 8).is_err());
        assert!(decode(ADC, b"\x00\x00", 3).is_err());
    }
}

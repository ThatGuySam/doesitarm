use crate::{
    Result, ScanError,
    decode::{self, DecodeBudget},
};
use std::io::{self, Write};

pub(crate) const ZERO: u32 = 0;
pub(crate) const RAW: u32 = 1;
pub(crate) const IGNORE: u32 = 2;
pub(crate) const ADC: u32 = 0x8000_0004;
pub(crate) const ZLIB: u32 = 0x8000_0005;
pub(crate) const BZIP2: u32 = 0x8000_0006;
pub(crate) const LZFSE: u32 = 0x8000_0007;
pub(crate) const LZMA: u32 = 0x8000_0008;
const INVALID: ScanError = ScanError::Invalid("UDIF compressed chunk");

pub(crate) fn decode(
    kind: u32,
    input: &[u8],
    size: usize,
    work: &DecodeBudget<'_>,
) -> Result<Vec<u8>> {
    if !matches!(kind, ADC | LZFSE | ZLIB | BZIP2 | LZMA) {
        return Err(ScanError::Unsupported("UDIF chunk codec"));
    }
    work.check_chunk(input.len() as u64, size as u64)?;
    work.start_chunk(size as u64)?;
    if kind == ADC {
        return adc(input, size);
    }
    if kind == LZFSE {
        let mut out = Bounded(Vec::new(), size);
        let progress = lzfse_rust::LzfseRingDecoder::default().decode(&mut { input }, &mut out);
        work.check_deadline()?;
        let (consumed, _) = progress.map_err(|_| INVALID)?;
        work.check_chunk_ratio(consumed, size as u64)?;
        return if out.0.len() == size {
            Ok(out.0)
        } else {
            Err(INVALID)
        };
    }

    match kind {
        ZLIB => decode::zlib(input, size, INVALID, work),
        BZIP2 => {
            let mut decoder = bzip2::read::BzDecoder::new(input);
            let decoded = decode::exact(&mut decoder, size, INVALID, work)?;
            work.check_chunk_ratio(decoder.total_in(), size as u64)?;
            Ok(decoded)
        }
        LZMA => {
            // ULMO uses XZ framing and needs a bounded LZMA2 dictionary.
            let mut reader =
                lzma_rust2::XzReader::new_mem_limit(input, false, work.lzma_memory_kib());
            let decoded = decode::exact(&mut reader, size, INVALID, work)?;
            let consumed = input.len() - reader.inner().len();
            work.check_chunk_ratio(consumed as u64, size as u64)?;
            Ok(decoded)
        }
        _ => Err(ScanError::Unsupported("UDIF chunk codec")),
    }
}

struct Bounded(Vec<u8>, usize);

impl Write for Bounded {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.1 - self.0.len() {
            return Err(io::Error::other("UDIF chunk expands past declared size"));
        }
        self.0.try_reserve(bytes.len()).map_err(io::Error::other)?;
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn adc(mut input: &[u8], size: usize) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    while let Some((&tag, rest)) = input.split_first() {
        input = rest;
        if tag & 0x80 != 0 {
            let count = (tag as usize & 0x7f) + 1;
            if count > input.len() || count > size - out.len() {
                return Err(INVALID);
            }
            decode::append_output(&mut out, &input[..count])?;
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
            out.try_reserve(count)
                .map_err(|_| ScanError::Limit("decoded buffer could not be allocated"))?;
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
        let work = DecodeBudget::new(20);
        assert_eq!(decode(ADC, encoded, 9, &work).unwrap(), b"ababaaaaa");
        assert!(decode(ADC, encoded, 8, &work).is_err());
        assert!(decode(ADC, b"\x00\x00", 3, &work).is_err());
    }

    #[test]
    fn expansion_ratio_rejects_chunks_before_reserving_output() {
        let expanded = 32 * 1024 + 1;
        let work = DecodeBudget::new(expanded as u64);
        assert!(
            matches!(decode(BZIP2, b"x", expanded, &work), Err(ScanError::WorkLimit(reason)) if reason.contains("ratio"))
        );
        assert_eq!(work.used(), 0);
    }

    #[test]
    fn bzip2_accepts_a_highly_compressed_megabyte_within_the_work_budget() {
        let block = vec![0; 1024 * 1024];
        let mut encoder = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::best());
        encoder.write_all(&block).unwrap();
        let packed = encoder.finish().unwrap();
        assert!(packed.len() * 1024 < block.len());
        let work = DecodeBudget::new(block.len() as u64);
        assert_eq!(decode(BZIP2, &packed, block.len(), &work).unwrap(), block);
        assert_eq!(work.used(), block.len() as u64);
    }
}

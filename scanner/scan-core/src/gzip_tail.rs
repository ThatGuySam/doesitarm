use crate::{bom, cpio, le16, le32};
use flate2::{Decompress, FlushDecompress, Status};

pub(crate) const TAIL_BYTES: u64 = 64 * 1024;
const MAX_SUFFIX_OUTPUT: usize = 512 * 1024;
const MAX_TOTAL_OUTPUT: usize = 24 * 1024 * 1024;
const MAX_PROBES: usize = 4096;

/// Raw DEFLATE copies and literals are independent of byte values in the
/// preceding window. Any bytes derived from that unknown window must differ
/// between the two decodes. Only the matching, BOM-checked CPIO tail is used.
pub(crate) fn recover(tail: &[u8], target: &bom::Plist) -> Option<Vec<u8>> {
    let (compressed, trailer) = tail.split_at_checked(tail.len().checked_sub(8)?)?;
    let decoded_size = u64::from(le32(trailer, 4));
    let mut decoder = Decompress::new(false);
    let mut primary = vec![0; MAX_SUFFIX_OUTPUT];
    let mut confirmation = vec![0; MAX_SUFFIX_OUTPUT];
    let mut staged = Vec::with_capacity(tail.len() + 8);
    let mut output_left = MAX_TOTAL_OUTPUT;
    let mut probes = 0;
    for at in (0..compressed.len()).rev() {
        let input = &compressed[at..];
        let mut header = [0; 16];
        let count = header.len().min(input.len());
        header[..count].copy_from_slice(&input[..count]);
        let header = u128::from_le_bytes(header);
        for bit in (0..8).rev() {
            if !candidate(input, header >> bit, bit) {
                continue;
            }
            probes += 1;
            if probes > MAX_PROBES || output_left == 0 {
                return None;
            }
            let first = decode(
                &mut decoder,
                &mut staged,
                input,
                bit,
                0,
                &mut primary,
                &mut output_left,
            );
            let Some(first) = first else { continue };
            let Some(start) = decoded_size.checked_sub(first.len() as u64) else {
                continue;
            };
            let Some((record_at, plist)) = cpio::tail_plist(first, start, target) else {
                continue;
            };
            let second = decode(
                &mut decoder,
                &mut staged,
                input,
                bit,
                255,
                &mut confirmation,
                &mut output_left,
            );
            if second.is_some_and(|second| {
                second.len() == first.len() && second[record_at..] == first[record_at..]
            }) {
                return Some(plist.to_vec());
            }
        }
    }
    None
}

fn candidate(input: &[u8], header: u128, bit: usize) -> bool {
    match (header >> 1) & 3 {
        0 => {
            let at = (bit + 3).div_ceil(8);
            input
                .get(at..at + 4)
                .is_some_and(|length| le16(length, 0) ^ le16(length, 2) == u16::MAX)
        }
        2 => {
            // A dynamic header must describe a complete code-length alphabet.
            // Reject impossible starts before running the real decoder.
            let count = 4 + ((header >> 13) & 15) as usize;
            if (header >> 3) & 31 > 29 || input.len() * 8 < bit + 17 + 3 * count {
                return false;
            }
            let mut used = 0;
            for index in 0..count {
                let length = (header >> (17 + index * 3)) & 7;
                if length != 0 {
                    used += 1 << (7 - length);
                }
            }
            used == 1 << 7
        }
        // A fixed tree supplies no selective boundary check. Forward scanning
        // handles streams without a usable stored or dynamic restart signal.
        _ => false,
    }
}

fn decode<'a>(
    decoder: &mut Decompress,
    staged: &mut Vec<u8>,
    input: &[u8],
    bit: usize,
    seed: u8,
    output: &'a mut [u8],
    output_left: &mut usize,
) -> Option<&'a [u8]> {
    decoder.reset(false);
    decoder.set_dictionary(&[seed; 32 * 1024]).ok()?;
    let encoded = if bit == 0 {
        input
    } else {
        stage_aligned(staged, input, bit, seed);
        staged.as_slice()
    };
    let limit = output.len().min(*output_left);
    let status = decoder.decompress(encoded, &mut output[..limit], FlushDecompress::Finish);
    let count = decoder.total_out() as usize;
    *output_left = output_left.saturating_sub(count);
    if status.ok()? != Status::StreamEnd || decoder.total_in() != encoded.len() as u64 {
        return None;
    }
    output.get((bit % 2)..count)
}

fn stage_aligned(staged: &mut Vec<u8>, input: &[u8], bit: usize, seed: u8) {
    // A synthetic nonfinal fixed block aligns the real block to its original
    // bit position. That preserves the alignment of any later stored blocks.
    // Empty fixed blocks use 10 bits. Adding one nine-bit literal makes 19.
    let mut word = 0u64;
    let mut position = 0;
    let mut push = |value, width| {
        word |= value << position;
        position += width;
    };
    let odd = !bit.is_multiple_of(2);
    if odd {
        let literal = if seed == 0 { 144u16 } else { 255u16 };
        let code = (400 + literal - 144).reverse_bits() >> 7;
        push(2, 3);
        push(u64::from(code), 9);
        push(0, 7);
    }
    let empty = (0..4)
        .find(|blocks| (usize::from(odd) * 19 + blocks * 10) % 8 == bit)
        .unwrap();
    for _ in 0..empty {
        push(2, 3);
        push(0, 7);
    }
    push(u64::from(input[0] >> bit), 8 - bit);
    staged.clear();
    staged.extend_from_slice(&word.to_le_bytes()[..position / 8]);
    staged.extend_from_slice(&input[1..]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthetic_prefix_preserves_stored_block_alignment_at_every_bit() {
        for bit in 0..8 {
            // Final stored block, one byte, with padding based on the original bit position.
            let mut input = if bit <= 5 {
                vec![1 << bit]
            } else {
                vec![1 << bit, 0]
            };
            input.extend_from_slice(&[1, 0, 254, 255, b'x']);
            assert!(candidate(&input, 0, bit));
            let mut decoder = Decompress::new(false);
            let mut staged = Vec::new();
            let mut output = [0; 10];
            let mut cap = 10;
            for seed in [0, 255] {
                let out = decode(
                    &mut decoder,
                    &mut staged,
                    &input,
                    bit,
                    seed,
                    &mut output,
                    &mut cap,
                );
                assert_eq!(out, Some(&b"x"[..]), "start bit {bit}");
            }
        }
    }
}

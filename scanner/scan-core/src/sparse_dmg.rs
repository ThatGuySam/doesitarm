use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, be32, check_range, decode::DecodeBudget, dmg,
};

const HEADER: u64 = 4096;
const SECTOR: u64 = 512;
const INDEX_START: usize = 64;
const BAD_INDEX: ScanError = ScanError::Invalid("sparse Apple disk image band index");

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    check_range(input.size(), 0, HEADER)?;
    let header = input.read_at(0, HEADER as usize).await?;
    if be32(&header, 4) != 3 {
        return Err(ScanError::Unsupported("sparse Apple disk image version"));
    }
    let band_size = u64::from(be32(&header, 8)) * SECTOR;
    let size = u64::from(be32(&header, 16)) * SECTOR;
    if band_size == 0 || size == 0 {
        return Err(BAD_INDEX);
    }

    let mut bands = Vec::new();
    let mut packed_size = HEADER;
    for (index, field) in header[INDEX_START..].as_chunks::<4>().0.iter().enumerate() {
        let band = u64::from(u32::from_be_bytes(*field));
        if band == 0 {
            continue;
        }
        if band > size.div_ceil(band_size) {
            return Err(BAD_INDEX);
        }
        let start = HEADER + index as u64 * band_size;
        check_range(input.size(), start, band_size)?;
        bands.push((band - 1, start));
        packed_size = start + band_size;
    }
    if packed_size != input.size() {
        return Err(ScanError::Unsupported(
            "sparse Apple disk image with chained band indexes or partial stored bands",
        ));
    }
    bands.sort_unstable();
    if bands.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return Err(BAD_INDEX);
    }

    let mut disk = SparseDisk {
        input,
        work,
        size,
        band_size,
        bands,
    };
    let prefix = disk.read_at(0, SECTOR as usize).await?;
    if dmg::scan_raw(&mut disk, &prefix, work, target, out).await? {
        Ok(())
    } else {
        Err(ScanError::Unsupported(
            "no HFS+ or APFS filesystem in sparse Apple disk image",
        ))
    }
}

struct SparseDisk<'a, S> {
    input: &'a mut S,
    work: &'a DecodeBudget<'a>,
    size: u64,
    band_size: u64,
    bands: Vec<(u64, u64)>,
}

impl<S: ReadAt> ReadAt for SparseDisk<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.input.remaining_budget()
    }

    async fn read_at(&mut self, mut offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        let mut output = Vec::with_capacity(len);
        while output.len() < len {
            self.work.check_deadline()?;
            let band = offset / self.band_size;
            let within = offset % self.band_size;
            let count = (self.band_size - within).min((len - output.len()) as u64) as usize;
            if let Ok(index) = self.bands.binary_search_by_key(&band, |&(index, _)| index) {
                output.extend(
                    self.input
                        .read_at(self.bands[index].1 + within, count)
                        .await?,
                );
            } else {
                self.work.charge(count as u64)?;
                output.resize(output.len() + count, 0);
            }
            offset += count as u64;
        }
        Ok(output)
    }
}

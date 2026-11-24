use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, Window, apfs, be16, be32, be64, check_range,
    decode::DecodeBudget,
    hfs, le32, le64, plist_value,
    udif_codec::{self, IGNORE, RAW, ZERO},
};
use plist::Value;
use std::{collections::VecDeque, ops::Range};

const SECTOR: u64 = 512;
const MAX_RUN: u64 = 16 * 1024 * 1024;
const MAX_INDEX: u64 = 8 * 1024 * 1024;
const MAX_IMAGE_RUN_READS: usize = 8192;
const MAX_RUN_DESCRIPTIONS: usize = 128 * 1024;

#[derive(Clone)]
struct Run {
    kind: u32,
    disk: Range<u64>,
    stored: Range<u64>,
}

struct Partition {
    hfs_hint: bool,
    apfs_hint: bool,
    disk: Range<u64>,
}

struct Image<'a, S> {
    source: &'a mut S,
    size: u64,
    runs: Vec<Run>,
    cache: VecDeque<(usize, Vec<u8>)>,
    work: &'a DecodeBudget<'a>,
    run_reads: usize,
}

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    trailer: &[u8],
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    if be32(trailer, 4) != 4 || be32(trailer, 8) != 512 {
        return Err(ScanError::Unsupported("UDIF trailer version"));
    }
    if be32(trailer, 60) > 1 || be64(trailer, 16) != 0 {
        return Err(ScanError::Unsupported("segmented UDIF image"));
    }
    let trailer_at = input.size() - 512;
    let fork_at = be64(trailer, 24);
    let fork_len = be64(trailer, 32);
    check_range(trailer_at, fork_at, fork_len)?;
    let xml_at = be64(trailer, 216);
    let xml_len = be64(trailer, 224);
    check_range(trailer_at, xml_at, xml_len)?;
    if xml_len == 0 {
        return Err(ScanError::Unsupported(
            "UDIF image without a property-list index",
        ));
    }
    if xml_len > MAX_INDEX {
        return Err(ScanError::Limit("UDIF index exceeds 8 MiB"));
    }

    let size = sectors(be64(trailer, 492))?;
    let (runs, partitions) = {
        let xml = input.read_at(xml_at, xml_len as usize).await?;
        parse_index(&xml, size, fork_at..fork_at + fork_len)?
    };
    let mut image = Image {
        source: input,
        size,
        runs,
        cache: VecDeque::new(),
        work,
        run_reads: 0,
    };
    let (partition, fs) = find_filesystem(&mut image, &partitions).await?;
    let mut volume = Window::new(&mut image, partition.start, partition.end - partition.start)?;
    match fs {
        Filesystem::Hfs => hfs::scan(&mut volume, work, target, out).await,
        Filesystem::Apfs => apfs::scan(&mut volume, work, target, out).await,
    }
}

fn sectors(sectors: u64) -> Result<u64> {
    sectors
        .checked_mul(SECTOR)
        .ok_or(ScanError::Invalid("UDIF sector address overflow"))
}

fn parse_index(
    xml: &[u8],
    disk_size: u64,
    data_fork: Range<u64>,
) -> Result<(Vec<Run>, Vec<Partition>)> {
    let value = plist_value::parse(xml, ScanError::Invalid("UDIF plist"))?;
    let tables = value
        .as_dictionary()
        .and_then(|d| d.get("resource-fork"))
        .and_then(Value::as_dictionary)
        .and_then(|d| d.get("blkx"))
        .and_then(Value::as_array)
        .ok_or(ScanError::Invalid("UDIF blkx list"))?;
    if tables.len() > 128 {
        return Err(ScanError::Limit("UDIF exceeds 128 blkx tables"));
    }
    let mut runs = Vec::new();
    let mut partitions = Vec::new();
    let mut descriptions_left = MAX_RUN_DESCRIPTIONS;
    for table in tables {
        let dict = table
            .as_dictionary()
            .ok_or(ScanError::Invalid("UDIF blkx entry"))?;
        let name = dict
            .get("Name")
            .and_then(Value::as_string)
            .unwrap_or_default();
        let data = dict
            .get("Data")
            .and_then(Value::as_data)
            .ok_or(ScanError::Invalid("UDIF blkx data"))?;
        if data.len() < 204 || &data[..4] != b"mish" || be32(data, 4) != 1 {
            return Err(ScanError::Invalid("UDIF mish header"));
        }
        let base = sectors(be64(data, 8))?;
        let size = sectors(be64(data, 16))?;
        check_range(disk_size, base, size)?;
        if size != 0 {
            partitions.push(Partition {
                hfs_hint: name.contains("Apple_HFS"),
                apfs_hint: name.contains("Apple_APFS"),
                disk: base..base + size,
            });
        }
        let file_base = be64(data, 24);
        let descriptions = be32(data, 200) as usize;
        if descriptions > (data.len() - 204) / 40 {
            return Err(ScanError::Invalid("truncated UDIF run table"));
        }
        descriptions_left = descriptions_left
            .checked_sub(descriptions)
            .ok_or(ScanError::Limit("UDIF exceeds 131072 run descriptions"))?;
        for entry in data[204..].as_chunks::<40>().0.iter().take(descriptions) {
            let kind = be32(entry, 0);
            if kind == 0xffff_ffff {
                break;
            }
            if kind == 0x7fff_fffe || be64(entry, 16) == 0 {
                continue;
            }
            let start = sectors(be64(entry, 8))?;
            let len = sectors(be64(entry, 16))?;
            check_range(size, start, len)?;
            let (stored_start, stored_len) = if matches!(kind, ZERO | IGNORE) {
                (0, 0)
            } else {
                let start = file_base
                    .checked_add(be64(entry, 24))
                    .ok_or(ScanError::Invalid("UDIF stored offset overflow"))?;
                let packed = be64(entry, 32);
                check_range(data_fork.end - data_fork.start, start, packed)?;
                if kind == RAW && packed != len {
                    return Err(ScanError::Invalid("UDIF raw chunk length"));
                }
                (data_fork.start + start, packed)
            };
            runs.push(Run {
                kind,
                disk: base + start..base + start + len,
                stored: stored_start..stored_start + stored_len,
            });
        }
    }

    runs.sort_unstable_by_key(|run| run.disk.start);
    if runs.is_empty()
        || runs
            .windows(2)
            .any(|pair| pair[0].disk.end > pair[1].disk.start)
    {
        return Err(ScanError::Unsupported("empty or overlapping UDIF chunks"));
    }
    let mut stored: Vec<_> = runs
        .iter()
        .map(|run| &run.stored)
        .filter(|range| !range.is_empty())
        .collect();
    stored.sort_unstable_by_key(|range| range.start);
    if stored.windows(2).any(|pair| pair[0].end > pair[1].start) {
        return Err(ScanError::Invalid("overlapping UDIF stored ranges"));
    }
    Ok((runs, partitions))
}

impl<S: ReadAt> ReadAt for Image<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, mut offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        let mut bytes = Vec::with_capacity(len);
        while bytes.len() < len {
            self.work.check_deadline()?;
            if self.work.strict() {
                if self.run_reads == MAX_IMAGE_RUN_READS {
                    return Err(ScanError::WorkLimit("too many UDIF run reads"));
                }
                self.run_reads += 1;
            }
            let index = self.runs.partition_point(|run| run.disk.end <= offset);
            let run = self
                .runs
                .get(index)
                .filter(|run| run.disk.contains(&offset))
                .ok_or(ScanError::Invalid("unmapped UDIF sector"))?;
            let count = (run.disk.end - offset).min((len - bytes.len()) as u64) as usize;
            let within = offset - run.disk.start;
            match run.kind {
                ZERO | IGNORE => {
                    self.work.charge(count as u64)?;
                    bytes.resize(bytes.len() + count, 0);
                }
                RAW => bytes.extend(
                    self.source
                        .read_at(run.stored.start + within, count)
                        .await?,
                ),
                kind => {
                    let entry = if let Some(pos) = self.cache.iter().position(|(i, _)| *i == index)
                    {
                        self.cache.remove(pos).unwrap()
                    } else {
                        let packed = run.stored.end - run.stored.start;
                        let expanded = run.disk.end - run.disk.start;
                        if packed > MAX_RUN || expanded > MAX_RUN {
                            return Err(ScanError::Limit("UDIF compressed chunk exceeds 16 MiB"));
                        }
                        self.work.check_chunk(packed, expanded)?;
                        // Release the old chunk before allocating the decoder and output.
                        if self.cache.len() == 2 {
                            self.cache.pop_back();
                        }
                        let input = self
                            .source
                            .read_at(run.stored.start, packed as usize)
                            .await?;
                        (
                            index,
                            udif_codec::decode(kind, &input, expanded as usize, self.work)?,
                        )
                    };
                    let within = within as usize;
                    bytes.extend_from_slice(&entry.1[within..within + count]);
                    self.cache.push_front(entry);
                }
            }
            offset += count as u64;
        }
        Ok(bytes)
    }
}

enum Filesystem {
    Hfs,
    Apfs,
}

async fn find_filesystem(
    disk: &mut impl ReadAt,
    partitions: &[Partition],
) -> Result<(Range<u64>, Filesystem)> {
    for part in partitions.iter().filter(|part| part.hfs_hint) {
        if hfs_signature(disk, &part.disk).await? {
            return Ok((part.disk.clone(), Filesystem::Hfs));
        }
    }
    for part in partitions.iter().filter(|part| part.apfs_hint) {
        if disk.read_at(part.disk.start + 32, 4).await? == b"NXSB" {
            return Ok((part.disk.clone(), Filesystem::Apfs));
        }
    }
    // When blkx names offer no usable hint, try partition-only images and
    // the APM/GPT on a whole-disk image.
    for part in partitions.iter().filter(|part| !part.hfs_hint) {
        if part.disk.end - part.disk.start < 1536 {
            continue;
        }
        if hfs_signature(disk, &part.disk).await? {
            return Ok((part.disk.clone(), Filesystem::Hfs));
        }
        if disk.read_at(part.disk.start + 32, 4).await? == b"NXSB" {
            return Ok((part.disk.clone(), Filesystem::Apfs));
        }
    }
    partition_map(disk).await?.ok_or(ScanError::Unsupported(
        "no HFS+ or APFS filesystem in UDIF image",
    ))
}

async fn hfs_signature(disk: &mut impl ReadAt, part: &Range<u64>) -> Result<bool> {
    if part.end - part.start < 1536 {
        return Ok(false);
    }
    let sig = disk.read_at(part.start + 1024, 2).await?;
    Ok(matches!(sig.as_slice(), b"H+" | b"HX"))
}

async fn partition_map(disk: &mut impl ReadAt) -> Result<Option<(Range<u64>, Filesystem)>> {
    if disk.size() < 1024 {
        return Ok(None);
    }
    let first = disk.read_at(0, 1024).await?;
    let apm_block = if &first[..2] == b"ER" {
        be16(&first, 2) as u64
    } else {
        SECTOR
    };
    if matches!(apm_block, 512 | 1024 | 2048 | 4096) && disk.size() >= apm_block + SECTOR {
        let apm = if apm_block == SECTOR {
            first[512..].to_vec()
        } else {
            disk.read_at(apm_block, 512).await?
        };
        if apm.starts_with(b"PM") {
            let count = be32(&apm, 4);
            if count > 128 {
                return Err(ScanError::Limit(
                    "UDIF Apple partition map exceeds 128 entries",
                ));
            }
            for index in 1..=count {
                let part = if index == 1 {
                    apm.clone()
                } else {
                    disk.read_at(index as u64 * apm_block, 512).await?
                };
                if part.starts_with(b"PM") && part[48..80].starts_with(b"Apple_HFS") {
                    let start = be32(&part, 8) as u64 * apm_block;
                    let len = be32(&part, 12) as u64 * apm_block;
                    check_range(disk.size(), start, len)?;
                    return Ok(Some((start..start + len, Filesystem::Hfs)));
                }
            }
        }
    }

    let gpt = &first[512..];
    if gpt.starts_with(b"EFI PART") {
        let table_at = sectors(le64(gpt, 72))?;
        let count = le32(gpt, 80);
        let stride = le32(gpt, 84) as usize;
        if count > 128 || !(128..=512).contains(&stride) {
            return Err(ScanError::Limit("UDIF GUID partition table dimensions"));
        }
        let entries = disk.read_at(table_at, count as usize * stride).await?;
        for part in entries.chunks_exact(stride) {
            const HFS_GUID: [u8; 16] = [
                0x00, 0x53, 0x46, 0x48, 0, 0, 0xaa, 0x11, 0xaa, 0x11, 0, 0x30, 0x65, 0x43, 0xec,
                0xac,
            ];
            const APFS_GUID: [u8; 16] = [
                0xef, 0x57, 0x34, 0x7c, 0, 0, 0xaa, 0x11, 0xaa, 0x11, 0, 0x30, 0x65, 0x43, 0xec,
                0xac,
            ];
            let fs = if part.starts_with(&HFS_GUID) {
                Filesystem::Hfs
            } else if part.starts_with(&APFS_GUID) {
                Filesystem::Apfs
            } else {
                continue;
            };
            {
                let start = sectors(le64(part, 32))?;
                let end = sectors(
                    le64(part, 40)
                        .checked_add(1)
                        .ok_or(ScanError::Invalid("GPT end sector overflow"))?,
                )?;
                if start >= end || end > disk.size() {
                    return Err(ScanError::Invalid("GPT partition extent"));
                }
                return Ok(Some((start..end, fs)));
            }
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_udif_codec_reserves_a_chunk_before_decoding() {
        let image = include_bytes!("../../fixtures/hfsx.dmg");
        let trailer_at = image.len() - 512;
        let trailer = &image[trailer_at..];
        let index = be64(trailer, 216) as usize;
        let fork = be64(trailer, 24);
        let (runs, _) = parse_index(
            &image[index..trailer_at],
            sectors(be64(trailer, 492)).unwrap(),
            fork..fork + be64(trailer, 32),
        )
        .unwrap();
        for kind in [
            udif_codec::ADC,
            udif_codec::ZLIB,
            udif_codec::BZIP2,
            udif_codec::LZFSE,
            udif_codec::LZMA,
        ] {
            let run = runs.iter().find(|run| run.kind == kind).unwrap();
            let packed = &image[run.stored.start as usize..run.stored.end as usize];
            let expanded = (run.disk.end - run.disk.start) as usize;

            let short = DecodeBudget::new(expanded as u64 - 1);
            assert!(matches!(
                udif_codec::decode(kind, packed, expanded, &short),
                Err(ScanError::WorkLimit(_))
            ));
            assert_eq!(short.used(), 0);

            let exact = DecodeBudget::new(expanded as u64);
            assert_eq!(
                udif_codec::decode(kind, packed, expanded, &exact)
                    .unwrap()
                    .len(),
                expanded
            );
            assert_eq!(exact.used(), expanded as u64);
        }
    }
}

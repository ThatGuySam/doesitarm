use crate::{
    ReadAt, Result, ScanError, ScanResult, Target, Window, bundle, check_range,
    decode::DecodeBudget,
    inflate::{Codec, Forward},
    inventory::{self, Allowance},
    launcher, le16, le32, le64, macho, nested,
};

const MAX_DIRECTORY: u64 = 16 * 1024 * 1024;

struct Directory {
    offset: u64,
    size: u64,
    count: u64,
    end_record: u64,
}

struct Entry {
    path: String,
    offset: u64,
    packed: u64,
    expanded: u64,
    method: u16,
    flags: u16,
    mode: u16,
}

impl Entry {
    fn is_symlink(&self) -> bool {
        self.mode & 0o170000 == 0o120000
    }
}

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let directory = read_directory(input).await?;
    check_range(directory.end_record, directory.offset, directory.size)?;
    if directory.size > MAX_DIRECTORY {
        return Err(ScanError::Limit("ZIP central directory exceeds 16 MiB"));
    }
    let records = input
        .read_at(directory.offset, directory.size as usize)
        .await?;
    let entries = read_entries(&records, directory.count)?;

    if let Target::Executable(requested) = target {
        let executable = entries
            .iter()
            .filter_map(|entry| Some((entry, bundle::archive_path(&entry.path)?)))
            .filter(|(_, path)| bundle::matches_path(path, requested))
            .min_by_key(|(_, path)| (path.matches('/').count(), *path))
            .ok_or(ScanError::NotFound(
                "declared standalone executable in ZIP central directory",
            ))?;
        out.executable_path = Some(executable.1.to_owned());
        out.executable_size = Some(executable.0.expanded);
        let primary = {
            let mut data = member(input, executable.0, directory.offset, work).await?;
            launcher::inspect(
                &mut data,
                executable.1,
                &mut out.architectures,
                &mut out.script_runtime,
            )
            .await
        };
        read_runtime(input, &entries, directory.offset, work, out).await;
        return primary;
    }

    let app = entries
        .iter()
        .filter_map(|entry| {
            if entry.is_symlink() {
                return None;
            }
            let path = bundle::archive_path(&entry.path)?;
            Some((entry, bundle::selected_plist(path, target)?))
        })
        .min_by_key(|(_, name)| (name.matches('/').count(), *name));
    let Some((entry, name)) = app else {
        return scan_nested(input, &entries, directory.offset, work, target, out).await;
    };
    out.bundle_path = Some(name.to_owned());

    if entry.expanded > bundle::MAX_PLIST {
        return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
    }
    let plist = member(input, entry, directory.offset, work)
        .await?
        .read_at(0, entry.expanded as usize)
        .await?;
    let path = bundle::apply_plist(&plist, name, out)?;

    let primary = read_main(input, &entries, directory.offset, work, &path, out).await;
    read_runtime(input, &entries, directory.offset, work, out).await;
    let mut inventory = crate::BinaryInventory::default();
    if let Err(error) = &primary {
        inventory.partial(error.to_string());
    }
    let mut allowance = Allowance::new(input, work);
    for entry in &entries {
        let Some(relative) = bundle::archive_path(&entry.path)
            .filter(|candidate| *candidate != path)
            .and_then(|candidate| inventory::relative(candidate, name))
        else {
            continue;
        };
        let Some(role) = inventory::role(relative) else {
            continue;
        };
        if relative.ends_with('/') || entry.expanded < 8 || entry.is_symlink() {
            continue;
        }
        if let Err(error) = allowance.step(input, work) {
            inventory.partial(error.to_string());
            break;
        }
        let observed = match member(input, entry, directory.offset, work).await {
            Ok(mut data) => inventory::read(&mut data, relative, role, &mut inventory).await,
            Err(error) => Err(error),
        };
        if let Err(error) = observed {
            let stop = inventory::stop(&error);
            inventory.partial(error.to_string());
            if stop {
                break;
            }
        }
    }
    out.inventory = Some(inventory);
    primary
}

async fn read_main(
    input: &mut impl ReadAt,
    entries: &[Entry],
    heap_end: u64,
    work: &DecodeBudget<'_>,
    path: &str,
    out: &mut ScanResult,
) -> Result<()> {
    let executable = entries
        .iter()
        .find(|entry| bundle::archive_path(&entry.path) == Some(path))
        .ok_or(ScanError::NotFound(
            "declared executable in ZIP central directory",
        ))?;
    out.executable_size = Some(executable.expanded);
    let mut data = member(input, executable, heap_end, work).await?;
    launcher::inspect(
        &mut data,
        path,
        &mut out.architectures,
        &mut out.script_runtime,
    )
    .await
}

async fn read_runtime(
    input: &mut impl ReadAt,
    entries: &[Entry],
    heap_end: u64,
    work: &DecodeBudget<'_>,
    out: &mut ScanResult,
) {
    let Some(runtime) = out.script_runtime.as_mut() else {
        return;
    };
    let Some(entry) = entries.iter().find(|entry| {
        !entry.is_symlink() && bundle::archive_path(&entry.path) == Some(&runtime.path)
    }) else {
        return;
    };
    if let Ok(mut data) = member(input, entry, heap_end, work).await {
        let _ = macho::scan(&mut data, &mut runtime.architectures).await;
    }
}

async fn scan_nested(
    input: &mut impl ReadAt,
    entries: &[Entry],
    heap_end: u64,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let mut candidates: Vec<_> = entries
        .iter()
        .filter_map(|entry| {
            let path = bundle::archive_path(&entry.path)?;
            if entry.is_symlink() {
                return None;
            }
            let kind = nested::Kind::from_path(path)?;
            Some((entry, path, kind))
        })
        .collect();
    candidates.sort_by_key(|(entry, path, _)| {
        (path.matches('/').count(), std::cmp::Reverse(entry.expanded))
    });
    let mut first_failure = None;
    for (entry, path, kind) in
        candidates
            .into_iter()
            .take(if work.strict() { 8 } else { usize::MAX })
    {
        let mut result = ScanResult::new(out.total_size);
        result.format = out.format;
        let attempt = scan_nested_member(
            input,
            entry,
            heap_end,
            (path, kind),
            work,
            target,
            &mut result,
        )
        .await;
        match attempt {
            result_status @ (Ok(())
            | Err(
                ScanError::Budget | ScanError::WorkLimit(_) | ScanError::Source(_),
            )) => {
                *out = result;
                return result_status;
            }
            Err(error) if first_failure.is_none() => first_failure = Some((error, result)),
            Err(_) => (),
        }
    }
    if let Some((error, result)) = first_failure {
        *out = result;
        return Err(error);
    }
    Err(ScanError::NotFound(
        "app Info.plist in ZIP central directory",
    ))
}

async fn scan_nested_member(
    input: &mut impl ReadAt,
    entry: &Entry,
    heap_end: u64,
    (path, kind): (&str, nested::Kind),
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    const MAX_EXPANDED: u64 = 32 * 1024 * 1024;
    let mut member = member(input, entry, heap_end, work).await?;
    if let Member::Stored(mut source) = member {
        return nested::scan(&mut source, kind, path, work, target, out).await;
    }
    if entry.expanded > MAX_EXPANDED {
        if work.strict() {
            out.nested_artifacts.push(path.to_owned());
            return Err(ScanError::Limit(
                "compressed nested ZIP member exceeds 32 MiB",
            ));
        }
        return nested::scan(&mut SeekableMember(member), kind, path, work, target, out).await;
    }
    let bytes = member.read_at(0, entry.expanded as usize).await?;
    nested::scan(&mut Buffered(bytes), kind, path, work, target, out).await
}

/// Large nested images can jump back to earlier decoded offsets. Replay their
/// compressed member on demand, holding only the ranges the inner parser reads.
struct SeekableMember<'a, S>(Member<'a, S>);

impl<S: ReadAt> ReadAt for SeekableMember<'_, S> {
    fn size(&self) -> u64 {
        self.0.size()
    }

    fn remaining_budget(&self) -> u64 {
        self.0.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size(), offset, len as u64)?;
        match &mut self.0 {
            Member::Compressed(source) => source.rewind_for(offset)?,
            Member::Lzma(source) => source.rewind_for(offset)?,
            Member::Stored(_) => {}
        }
        self.0.read_at(offset, len).await
    }
}

struct Buffered(Vec<u8>);

impl ReadAt for Buffered {
    fn size(&self) -> u64 {
        self.0.len() as u64
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size(), offset, len as u64)?;
        Ok(self.0[offset as usize..offset as usize + len].to_vec())
    }
}

async fn read_directory(input: &mut impl ReadAt) -> Result<Directory> {
    let size = input.size();
    if size < 22 {
        return Err(ScanError::Invalid("ZIP end record missing"));
    }

    // Grow the suffix only when it contains a comment. Retain each fetched
    // window so long comments never trigger duplicate reads.
    let max_tail = size.min(22 + u16::MAX as u64) as usize;
    let mut tail = input.read_at(size - 22, 22).await?;
    let (eocd_offset, eocd) = loop {
        if let Some(index) = end_record(&tail) {
            break (
                size - tail.len() as u64 + index as u64,
                &tail[index..index + 22],
            );
        }
        if tail.len() == max_tail {
            return Err(ScanError::Invalid("ZIP end record missing"));
        }
        let len = max_tail.min((tail.len() * 4).max(128));
        let mut prefix = input.read_at(size - len as u64, len - tail.len()).await?;
        prefix.append(&mut tail);
        tail = prefix;
    };

    let disk = le16(eocd, 4);
    let directory_disk = le16(eocd, 6);
    let count_disk = le16(eocd, 8);
    let count = le16(eocd, 10);
    if !matches!(disk, 0 | u16::MAX)
        || !matches!(directory_disk, 0 | u16::MAX)
        || (count_disk != count && count_disk != u16::MAX && count != u16::MAX)
    {
        return Err(ScanError::Unsupported("multi-disk ZIP"));
    }
    let length = le32(eocd, 12);
    let offset = le32(eocd, 16);
    let zip64 = [disk, directory_disk, count_disk, count].contains(&u16::MAX)
        || length == u32::MAX
        || offset == u32::MAX;
    if !zip64 {
        return Ok(Directory {
            offset: offset as u64,
            size: length as u64,
            count: count as u64,
            end_record: eocd_offset,
        });
    }

    let locator_at = eocd_offset
        .checked_sub(20)
        .ok_or(ScanError::Invalid("ZIP64 locator missing"))?;
    let locator = input.read_at(locator_at, 20).await?;
    if &locator[..4] != b"PK\x06\x07" {
        return Err(ScanError::Invalid("ZIP64 locator signature"));
    }
    if le32(&locator, 4) != 0 || le32(&locator, 16) != 1 {
        return Err(ScanError::Unsupported("multi-disk ZIP64"));
    }
    let record_at = le64(&locator, 8);
    check_range(locator_at, record_at, 56)?;
    let record = input.read_at(record_at, 56).await?;
    let record_size = le64(&record, 4);
    if &record[..4] != b"PK\x06\x06"
        || record_size < 44
        || record_size != locator_at - record_at - 12
    {
        return Err(ScanError::Invalid("ZIP64 end record"));
    }
    if le32(&record, 16) != 0 || le32(&record, 20) != 0 || le64(&record, 24) != le64(&record, 32) {
        return Err(ScanError::Unsupported("multi-disk ZIP64"));
    }
    Ok(Directory {
        offset: le64(&record, 48),
        size: le64(&record, 40),
        count: le64(&record, 32),
        end_record: record_at,
    })
}

fn end_record(tail: &[u8]) -> Option<usize> {
    (0..=tail.len().checked_sub(22)?).rev().find(|&i| {
        &tail[i..i + 4] == b"PK\x05\x06" && le16(tail, i + 20) as usize == tail.len() - i - 22
    })
}

fn read_entries(mut bytes: &[u8], count: u64) -> Result<Vec<Entry>> {
    if count > (bytes.len() / 46) as u64 {
        return Err(ScanError::Invalid("ZIP central directory entry count"));
    }
    if count > 150_000 {
        return Err(ScanError::Limit("ZIP directory exceeds 150,000 entries"));
    }
    let mut entries = Vec::with_capacity(count as usize);
    for _ in 0..count {
        if bytes.len() < 46 || &bytes[..4] != b"PK\x01\x02" {
            return Err(ScanError::Invalid("ZIP central directory entry"));
        }
        let name_len = le16(bytes, 28) as usize;
        let extra_len = le16(bytes, 30) as usize;
        let comment_len = le16(bytes, 32) as usize;
        let end = 46 + name_len + extra_len + comment_len;
        if end > bytes.len() {
            return Err(ScanError::Invalid("truncated ZIP directory entry"));
        }

        let name = std::str::from_utf8(&bytes[46..46 + name_len]);
        let flags = le16(bytes, 8);
        let method = le16(bytes, 10);
        let mode_type = le32(bytes, 38) >> 28;
        if let Ok(path) = name
            && !path.ends_with('/')
            && (bytes[5] != 3 || matches!(mode_type, 0 | 8 | 10))
        {
            let extra = &bytes[46 + name_len..end - comment_len];
            let mut expanded = le32(bytes, 24) as u64;
            let mut packed = le32(bytes, 20) as u64;
            let mut offset = le32(bytes, 42) as u64;
            let mut disk = le16(bytes, 34) as u32;
            if [expanded, packed, offset].contains(&(u32::MAX as u64)) || disk == u16::MAX as u32 {
                let mut ext = zip64_extra(extra)?;
                for value in [&mut expanded, &mut packed, &mut offset] {
                    if *value == u32::MAX as u64 {
                        if ext.len() < 8 {
                            return Err(ScanError::Invalid("short ZIP64 entry extra data"));
                        }
                        *value = le64(ext, 0);
                        ext = &ext[8..];
                    }
                }
                if disk == u16::MAX as u32 {
                    if ext.len() < 4 {
                        return Err(ScanError::Invalid("short ZIP64 disk field"));
                    }
                    disk = le32(ext, 0);
                }
            }
            if disk != 0 {
                return Err(ScanError::Unsupported("multi-disk ZIP entry"));
            }
            entries.push(Entry {
                path: path.to_owned(),
                offset,
                packed,
                expanded,
                method,
                flags,
                mode: if bytes[5] == 3 { le16(bytes, 40) } else { 0 },
            });
        }
        bytes = &bytes[end..];
    }
    Ok(entries)
}

fn zip64_extra(mut extra: &[u8]) -> Result<&[u8]> {
    while extra.len() >= 4 {
        let end = 4 + le16(extra, 2) as usize;
        if end > extra.len() {
            break;
        }
        if le16(extra, 0) == 1 {
            return Ok(&extra[4..end]);
        }
        extra = &extra[end..];
    }
    Err(ScanError::Invalid("missing ZIP64 entry extra data"))
}

async fn member<'a, S: ReadAt>(
    input: &'a mut S,
    entry: &Entry,
    heap_end: u64,
    work: &'a DecodeBudget<'a>,
) -> Result<Member<'a, S>> {
    if entry.flags & 1 != 0 {
        return Err(ScanError::Unsupported("encrypted ZIP member"));
    }
    let codec = match entry.method {
        0 => None,
        8 => Some(Codec::Deflate),
        12 => Some(Codec::Bzip2),
        14 => Some(Codec::Lzma),
        95 => Some(Codec::Xz),
        _ => return Err(ScanError::Unsupported("ZIP member compression method")),
    };
    if entry.method == 0 && entry.packed != entry.expanded {
        return Err(ScanError::Invalid("ZIP stored member lengths differ"));
    }

    check_range(heap_end, entry.offset, 30)?;
    let header = input.read_at(entry.offset, 30).await?;
    let name_len = le16(&header, 26) as usize;
    if &header[..4] != b"PK\x03\x04"
        || le16(&header, 8) != entry.method
        || le16(&header, 6) != entry.flags
        || name_len != entry.path.len()
    {
        return Err(ScanError::Invalid(
            "ZIP local header differs from directory",
        ));
    }

    let name_at = entry.offset + 30;
    let extra_len = le16(&header, 28) as u64;
    check_range(heap_end, name_at, name_len as u64 + extra_len)?;
    let offset = name_at + name_len as u64 + extra_len;
    check_range(heap_end, offset, entry.packed)?;
    if input.read_at(name_at, name_len).await? != entry.path.as_bytes() {
        return Err(ScanError::Invalid("ZIP local name differs from directory"));
    }
    if matches!(codec, Some(Codec::Lzma)) {
        const ZIP_LZMA_HEADER: u64 = 9;
        check_range(entry.packed, 0, ZIP_LZMA_HEADER)?;
        let properties = input.read_at(offset, ZIP_LZMA_HEADER as usize).await?;
        if le16(&properties, 2) != 5 {
            return Err(ScanError::Unsupported("ZIP LZMA properties length"));
        }
        let mut header = [0; 13];
        header[..5].copy_from_slice(&properties[4..]);
        header[5..].copy_from_slice(&entry.expanded.to_le_bytes());
        let source = Window::new(
            input,
            offset + ZIP_LZMA_HEADER,
            entry.packed - ZIP_LZMA_HEADER,
        )?;
        return Ok(Member::Lzma(Forward::new(
            Prefixed { source, header },
            entry.expanded,
            Codec::Lzma,
            work,
        )?));
    }
    let source = Window::new(input, offset, entry.packed)?;
    Ok(match codec {
        Some(codec) => Member::Compressed(Forward::new(source, entry.expanded, codec, work)?),
        None => Member::Stored(source),
    })
}

enum Member<'a, S> {
    Stored(Window<'a, S>),
    Compressed(Forward<'a, Window<'a, S>>),
    Lzma(Forward<'a, Prefixed<Window<'a, S>>>),
}

impl<S: ReadAt> ReadAt for Member<'_, S> {
    fn size(&self) -> u64 {
        match self {
            Self::Stored(source) => source.size(),
            Self::Compressed(source) => source.size(),
            Self::Lzma(source) => source.size(),
        }
    }

    fn remaining_budget(&self) -> u64 {
        match self {
            Self::Stored(source) => source.remaining_budget(),
            Self::Compressed(source) => source.remaining_budget(),
            Self::Lzma(source) => source.remaining_budget(),
        }
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        match self {
            Self::Stored(source) => source.read_at(offset, len).await,
            Self::Compressed(source) => source.read_at(offset, len).await,
            Self::Lzma(source) => source.read_at(offset, len).await,
        }
    }
}

/// ZIP separates LZMA properties from the plain byte stream. Present them
/// together in the LZMA-alone framing understood by the incremental decoder.
struct Prefixed<S> {
    source: S,
    header: [u8; 13],
}

impl<S: ReadAt> ReadAt for Prefixed<S> {
    fn size(&self) -> u64 {
        self.source.size() + self.header.len() as u64
    }

    fn remaining_budget(&self) -> u64 {
        self.source.remaining_budget()
    }

    async fn read_at(&mut self, mut offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size(), offset, len as u64)?;
        let header_len = self.header.len() as u64;
        let mut bytes = Vec::with_capacity(len);
        if offset < header_len {
            let count = ((header_len - offset) as usize).min(len);
            bytes.extend_from_slice(&self.header[offset as usize..offset as usize + count]);
            offset += count as u64;
        }
        if bytes.len() < len {
            bytes.extend(
                self.source
                    .read_at(offset - header_len, len - bytes.len())
                    .await?,
            );
        }
        Ok(bytes)
    }
}

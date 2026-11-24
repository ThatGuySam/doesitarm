use crate::{
    BinaryInventory, ReadAt, Result, ScanError, ScanResult, Target, Window, bundle, check_range,
    decode::DecodeBudget,
    inflate::{Codec, Forward},
    inventory::{self, Allowance},
    le32, le64, nested,
};
use sevenz_rust2::{Archive, ArchiveEntry, EncoderMethod, Password, SIGNATURE_HEADER_SIZE};
use std::io::{self, Read, Seek, SeekFrom};

const MAX_HEADER: u64 = 8 * 1024 * 1024;
const INDEX_DECODER_MEMORY: u64 = 16 * 1024 * 1024;
const INVALID: ScanError = ScanError::Invalid("7z archive index");

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let (archive, data_end) = read_index(input, work).await?;
    let offsets = member_offsets(&archive)?;
    let mut source = Members {
        input,
        work,
        archive: &archive,
        offsets,
        data_end,
    };
    let paths = archive
        .files
        .iter()
        .enumerate()
        .filter_map(|(index, file)| {
            if file.has_stream && !file.is_directory && !file.is_anti_item && !is_symlink(file) {
                Some((index, bundle::archive_path(&file.name)?))
            } else {
                None
            }
        });
    if let Target::Executable(requested) = target {
        let (index, path) = paths
            .filter(|(_, path)| bundle::matches_path(path, requested))
            .min_by_key(|(_, path)| (path.matches('/').count(), *path))
            .ok_or(ScanError::NotFound(
                "declared executable in 7z archive index",
            ))?;
        out.executable_path = Some(path.to_owned());
        out.executable_size = Some(archive.files[index].size);
        return out.scan_macho(&mut source.open(index)?).await;
    }
    let app = paths
        .clone()
        .filter_map(|(index, path)| Some((index, bundle::selected_plist(path, target)?)))
        .min_by_key(|(_, name)| (name.matches('/').count(), *name));
    let Some((info, root)) = app else {
        let mut candidates: Vec<_> = paths
            .filter_map(|(index, path)| Some((index, path, nested::Kind::from_path(path)?)))
            .collect();
        candidates.sort_by_key(|(index, path, _)| {
            (
                path.matches('/').count(),
                std::cmp::Reverse(archive.files[*index].size),
            )
        });
        let mut first_failure = None;
        for (index, path, kind) in
            candidates
                .into_iter()
                .take(if work.strict() { 8 } else { usize::MAX })
        {
            let mut result = out.subresult();
            result.format = out.format;
            let attempt = match source.open(index) {
                Ok(mut member) => {
                    nested::scan(&mut member, kind, path, work, target, &mut result).await
                }
                Err(error) => Err(error),
            };
            match attempt {
                done @ (Ok(())
                | Err(ScanError::Budget | ScanError::WorkLimit(_) | ScanError::Source(_))) => {
                    *out = result;
                    return done;
                }
                Err(error) if first_failure.is_none() => first_failure = Some((error, result)),
                Err(_) => (),
            }
        }
        if let Some((error, result)) = first_failure {
            *out = result;
            return Err(error);
        }
        return Err(ScanError::NotFound("app Info.plist in 7z archive index"));
    };

    out.bundle_path = Some(root.to_owned());
    let info_size = archive.files[info].size;
    if info_size > bundle::MAX_PLIST {
        return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
    }
    let plist = source.open(info)?.read_at(0, info_size as usize).await?;
    let main = bundle::apply_plist(&plist, root, out)?;
    let primary = match paths.clone().find(|(_, path)| *path == main) {
        Some((index, _)) => {
            out.executable_size = Some(archive.files[index].size);
            out.scan_macho(&mut source.open(index)?).await
        }
        None => Err(ScanError::NotFound(
            "declared executable in 7z archive index",
        )),
    };
    let mut inventory = BinaryInventory::default();
    // In a solid block, open one stream for the entire block during
    // enumeration so later files don't repeatedly decode its prefix.
    let mut allowance = Allowance::new(source.input, work);
    let coverage =
        inventory_members(&mut source, root, &main, &mut allowance, &mut inventory).await;
    if let Err(error) = coverage {
        inventory.partial(error.to_string());
    }
    inventory.record_primary(&primary);
    out.inventory = Some(inventory);
    primary
}

async fn inventory_members(
    source: &mut Members<'_, impl ReadAt>,
    root: &str,
    main: &str,
    allowance: &mut Allowance,
    inventory: &mut BinaryInventory,
) -> Result<()> {
    let archive = source.archive;
    for block in 0..archive.blocks.len() {
        let (first, last) = block_files(archive, block)?;
        let entries = archive.files[first..last]
            .iter()
            .enumerate()
            .filter_map(|(at, file)| {
                let path = bundle::archive_path(&file.name)?;
                let relative = inventory::relative(path, root)?;
                let role = inventory::role(relative)?;
                (path != main
                    && file.has_stream
                    && !file.is_anti_item
                    && !is_symlink(file)
                    && file.size >= 8)
                    .then_some((first + at, file, relative, role))
            });
        let mut entries = entries.peekable();
        if entries.peek().is_none() {
            continue;
        }
        allowance.step(source.input, source.work)?;
        let offsets = &source.offsets;
        let work = source.work;
        let mut decoded = match open_block(source.input, work, archive, block, source.data_end) {
            Ok(decoded) => decoded,
            Err(error) if inventory::stop(&error) => return Err(error),
            Err(error) => {
                inventory.partial(error.to_string());
                continue;
            }
        };
        for (index, file, relative, role) in entries {
            allowance.step(&decoded, work)?;
            let mut member = Window::new(&mut decoded, offsets[index], file.size)?;
            if let Err(error) = inventory::read(&mut member, relative, role, inventory).await {
                if inventory::stop(&error) {
                    return Err(error);
                }
                inventory.partial(error.to_string());
            }
        }
    }
    Ok(())
}

fn is_symlink(file: &ArchiveEntry) -> bool {
    file.has_windows_attributes && (file.windows_attributes >> 16) & 0o170000 == 0o120000
}

struct Members<'a, S> {
    input: &'a mut S,
    work: &'a DecodeBudget<'a>,
    archive: &'a Archive,
    offsets: Vec<u64>,
    data_end: u64,
}

impl<S: ReadAt> Members<'_, S> {
    fn open(&mut self, index: usize) -> Result<Member<'_, S>> {
        let block = self.archive.stream_map.file_block_index[index].ok_or(INVALID)?;
        let size = self.archive.files[index].size;
        let offset = self.offsets[index];
        let data = open_block(self.input, self.work, self.archive, block, self.data_end)?;
        check_range(data.size(), offset, size)?;
        Ok(Member { data, offset, size })
    }
}

fn member_offsets(archive: &Archive) -> Result<Vec<u64>> {
    let mut offsets = vec![0; archive.files.len()];
    for (index, block) in archive.blocks.iter().enumerate() {
        let (first, last) = block_files(archive, index)?;
        let mut logical = 0_u64;
        let Some(files) = archive.files.get(first..last) else {
            return Err(INVALID);
        };
        for (index, entry) in files.iter().enumerate() {
            offsets[first + index] = logical;
            logical = logical.checked_add(entry.size).ok_or(INVALID)?;
        }
        if logical != block.get_unpack_size() {
            return Err(INVALID);
        }
    }
    Ok(offsets)
}

fn block_files(archive: &Archive, block: usize) -> Result<(usize, usize)> {
    let starts = &archive.stream_map.block_first_file_index;
    let first = *starts.get(block).ok_or(INVALID)?;
    let last = starts
        .get(block + 1)
        .copied()
        .unwrap_or(archive.files.len());
    if first <= last && last <= archive.files.len() {
        Ok((first, last))
    } else {
        Err(INVALID)
    }
}

enum BlockSource<'a, S> {
    Stored(Window<'a, S>),
    Compressed(Box<Forward<'a, Window<'a, S>>>),
}

fn open_block<'a, S: ReadAt>(
    input: &'a mut S,
    work: &'a DecodeBudget<'a>,
    archive: &Archive,
    block: usize,
    data_end: u64,
) -> Result<BlockSource<'a, S>> {
    let map = &archive.stream_map;
    let pack = *map
        .block_first_pack_stream_index()
        .get(block)
        .ok_or(INVALID)?;
    let end = map
        .block_first_pack_stream_index()
        .get(block + 1)
        .copied()
        .unwrap_or(archive.pack_sizes().len());
    let [coder] = archive.blocks[block].coders.as_slice() else {
        return Err(ScanError::Unsupported(
            "7z compression uses multiple coders",
        ));
    };
    if end != pack + 1 {
        return Err(ScanError::Unsupported(
            "7z compression uses multiple packed streams",
        ));
    }
    let packed = archive.pack_sizes().get(pack).copied().ok_or(INVALID)?;
    let offset = SIGNATURE_HEADER_SIZE
        .checked_add(archive.pack_pos())
        .and_then(|base| base.checked_add(*map.pack_stream_offsets().get(pack)?))
        .ok_or(INVALID)?;
    check_range(data_end, offset, packed)?;
    let expanded = archive.blocks[block].get_unpack_size();
    let source = Window::new(input, offset, packed)?;
    let codec = match coder.encoder_method_id() {
        EncoderMethod::ID_COPY if packed == expanded => return Ok(BlockSource::Stored(source)),
        EncoderMethod::ID_LZMA => {
            let &[properties, a, b, c, d] = coder.properties() else {
                return Err(INVALID);
            };
            Codec::RawLzma {
                size: expanded,
                properties,
                dictionary: u32::from_le_bytes([a, b, c, d]),
            }
        }
        EncoderMethod::ID_LZMA2 => {
            let &[bits] = coder.properties() else {
                return Err(INVALID);
            };
            let dictionary = match bits {
                0..=39 => (2 | (u32::from(bits) & 1)) << (u32::from(bits) / 2 + 11),
                40 => u32::MAX,
                _ => return Err(INVALID),
            };
            Codec::Lzma2(dictionary)
        }
        _ => return Err(ScanError::Unsupported("7z compression method")),
    };
    Ok(BlockSource::Compressed(Box::new(Forward::new(
        source, expanded, codec, work,
    )?)))
}

impl<S: ReadAt> ReadAt for BlockSource<'_, S> {
    fn size(&self) -> u64 {
        match self {
            Self::Stored(window) => window.size(),
            Self::Compressed(stream) => stream.size(),
        }
    }

    fn remaining_budget(&self) -> u64 {
        match self {
            Self::Stored(window) => window.remaining_budget(),
            Self::Compressed(stream) => stream.remaining_budget(),
        }
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        match self {
            Self::Stored(window) => window.read_at(offset, len).await,
            Self::Compressed(stream) => {
                stream.rewind_for(offset)?;
                stream.read_at(offset, len).await
            }
        }
    }
}

struct Member<'a, S> {
    data: BlockSource<'a, S>,
    offset: u64,
    size: u64,
}

impl<S: ReadAt> ReadAt for Member<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.data.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        self.data.read_at(self.offset + offset, len).await
    }
}

async fn read_index(input: &mut impl ReadAt, work: &DecodeBudget<'_>) -> Result<(Archive, u64)> {
    let start = input.read_at(0, SIGNATURE_HEADER_SIZE as usize).await?;
    if start[..6] != *b"7z\xbc\xaf\x27\x1c"
        || le32(&start, 8) == 0 && start[12..].iter().all(|byte| *byte == 0)
    {
        return Err(INVALID);
    }
    let header_at = SIGNATURE_HEADER_SIZE
        .checked_add(le64(&start, 12))
        .ok_or(INVALID)?;
    let size = le64(&start, 20);
    if size > MAX_HEADER {
        return Err(ScanError::Limit("7z next header exceeds 8 MiB"));
    }
    let header = input.read_at(header_at, size as usize).await?;
    let mut parts = vec![(0, start), (header_at, header)];
    let mut data_end = header_at;
    if let Some((offset, packed)) = encoded_header(&parts[1].1)? {
        check_range(header_at, offset, packed)?;
        if packed > MAX_HEADER {
            return Err(ScanError::Limit("7z packed index exceeds 8 MiB"));
        }
        // The index parser bounds its expanded allocation separately. Charge
        // its upper bound before invoking the synchronous decoder.
        work.start_chunk(INDEX_DECODER_MEMORY)?;
        parts.push((offset, input.read_at(offset, packed as usize).await?));
        data_end = offset;
    }
    let mut reader = Index {
        position: 0,
        length: input.size(),
        parts,
    };
    let archive = Archive::read_with_memory_limit(
        &mut reader,
        &Password::empty(),
        (INDEX_DECODER_MEMORY / 1024) as usize,
    )
    .map_err(|error| match error {
        sevenz_rust2::Error::MaxMemLimited { .. } => {
            ScanError::WorkLimit("7z index memory limit reached")
        }
        _ => INVALID,
    })?;
    work.check_deadline()?;
    Ok((archive, data_end))
}

fn encoded_header(mut bytes: &[u8]) -> Result<Option<(u64, u64)>> {
    if bytes.first() != Some(&0x17) {
        return Ok(None);
    }
    bytes = bytes.strip_prefix(&[0x17, 0x06]).ok_or(INVALID)?;
    let offset = SIGNATURE_HEADER_SIZE
        .checked_add(vli(&mut bytes)?)
        .ok_or(INVALID)?;
    if vli(&mut bytes)? != 1 {
        return Err(ScanError::Unsupported(
            "7z index uses multiple packed streams",
        ));
    }
    bytes = bytes.strip_prefix(&[0x09]).ok_or(INVALID)?;
    Ok(Some((offset, vli(&mut bytes)?)))
}

fn vli(bytes: &mut &[u8]) -> Result<u64> {
    let (&first, rest) = bytes.split_first().ok_or(INVALID)?;
    *bytes = rest;
    let extra = first.leading_ones() as usize;
    let data = bytes.get(..extra).ok_or(INVALID)?;
    let mut little = [0; 8];
    little[..extra].copy_from_slice(data);
    if extra < 8 {
        little[extra] = first & (0x7f >> extra);
    }
    *bytes = &bytes[extra..];
    Ok(u64::from_le_bytes(little))
}

// The upstream index parser sees only the signature and the bounded header
// regions. Data streams are opened later with the async range reader.
struct Index {
    position: u64,
    length: u64,
    parts: Vec<(u64, Vec<u8>)>,
}

impl Read for Index {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        let Some(bytes) = self.parts.iter().find_map(|(start, bytes)| {
            let offset = usize::try_from(self.position.checked_sub(*start)?).ok()?;
            bytes.get(offset..).filter(|region| !region.is_empty())
        }) else {
            return Ok(0);
        };
        let count = out.len().min(bytes.len());
        out[..count].copy_from_slice(&bytes[..count]);
        self.position += count as u64;
        Ok(count)
    }
}

impl Seek for Index {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let position = match from {
            SeekFrom::Start(position) => Some(position),
            SeekFrom::Current(relative) => self.position.checked_add_signed(relative),
            SeekFrom::End(relative) => self.length.checked_add_signed(relative),
        }
        .filter(|position| *position <= self.length);
        self.position = position.ok_or(io::ErrorKind::InvalidInput)?;
        Ok(self.position)
    }
}

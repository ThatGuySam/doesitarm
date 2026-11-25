//! Microsoft Cabinet directory and uncompressed CFDATA blocks.
use super::{ArchiveEvidence, UNKNOWN_PAYLOAD, Windows, pe, pe_extension, resembles_installer};
use crate::{
    ReadAt, Result, ScanError, ScanResult, Window, check_range, decode::DecodeBudget,
    inventory::Allowance, le16, le32,
};

const INVALID: ScanError = ScanError::Invalid("Cabinet header or extent");
const MAX_DIRECTORY: u64 = 128 * 1024;

struct Folder {
    data: u64,
    blocks: u16,
    codec: u16,
}

pub(crate) async fn inspect(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let header = input.read_at(0, 36).await?;
    let size = u64::from(le32(&header, 8));
    let files_at = u64::from(le32(&header, 16));
    let folder_count = usize::from(le16(&header, 26));
    let file_count = usize::from(le16(&header, 28));
    let flags = le16(&header, 30);
    if &header[..4] != b"MSCF"
        || header[25] != 1
        || size > input.size()
        || files_at < 36
        || files_at > size
        || folder_count == 0
        || flags & !7 != 0
    {
        return Err(INVALID);
    }

    let mut windows = Windows {
        installer_kind: Some("cab"),
        payload_status: Some(UNKNOWN_PAYLOAD),
        ..Windows::default()
    };
    // Spanned cabinets refer to other files. Keep inspection within this source.
    if flags & 3 != 0 {
        windows.set_result(out);
        return Ok(());
    }
    let mut folders_at = 36;
    let (folder_reserve, block_reserve) = if flags & 4 != 0 {
        let reserve = input.read_at(36, 4).await?;
        folders_at += 4 + u64::from(le16(&reserve, 0));
        (usize::from(reserve[2]), u64::from(reserve[3]))
    } else {
        (0, 0)
    };
    let folder_size = 8 + folder_reserve;
    let folders_len = folder_count * folder_size;
    let folders_end = folders_at + folders_len as u64;
    if folders_end > files_at {
        return Err(INVALID);
    }
    if folders_len as u64 > MAX_DIRECTORY || file_count > 4096 {
        windows.set_result(out);
        return Err(ScanError::Limit("Cabinet file table"));
    }
    let folder_table = input.read_at(folders_at, folders_len).await?;
    let folders: Vec<_> = folder_table
        .chunks_exact(folder_size)
        .map(|r| Folder {
            data: le32(r, 0).into(),
            blocks: le16(r, 4),
            codec: le16(r, 6),
        })
        .collect();
    let first_block = folders.iter().map(|f| f.data).min().ok_or(INVALID)?;
    let directory_len = first_block
        .checked_sub(files_at)
        .filter(|_| first_block <= size)
        .ok_or(INVALID)?;
    let records = input
        .read_at(files_at, directory_len.min(MAX_DIRECTORY) as usize)
        .await?;
    let mut files = records.as_slice();
    let mut allowance = Allowance::new(input, work);
    let mut evidence = ArchiveEvidence::default();
    let mut has_installer = false;
    for _ in 0..file_count {
        if files.len() < 17 {
            return Err(INVALID);
        }
        let length = u64::from(le32(files, 0));
        let offset = u64::from(le32(files, 4));
        let folder = folders.get(usize::from(le16(files, 8)));
        let name_length = files[16..]
            .iter()
            .position(|&byte| byte == 0)
            .ok_or(INVALID)?;
        let name = &files[16..16 + name_length];
        files = &files[17 + name_length..];
        let name = String::from_utf8_lossy(name);
        if resembles_installer(&name) {
            has_installer = true;
            evidence.partial();
        }
        let Some(executable) = pe_extension(&name) else {
            continue;
        };
        if length < 64 {
            continue;
        }
        let Some(folder) = folder.filter(|folder| folder.codec == 0) else {
            evidence.partial();
            continue;
        };
        if allowance.step(input, work).is_err() {
            evidence.partial();
            break;
        }
        let mut stream = Blocks {
            input,
            folder,
            block_reserve,
            size,
            index: Vec::new(),
        };
        let mut member = Window::new(&mut stream, offset, length)?;
        let mut found = Windows::default();
        let result = pe(&mut member, &mut found).await;
        if found.machine.is_some() {
            evidence.add(found, executable);
        }
        if let Err(error) = result {
            evidence.partial();
            if crate::inventory::stop(&error) {
                if !evidence.finish("cab", out) {
                    windows.set_result(out);
                }
                return Err(error);
            }
        }
    }
    if !evidence.finish("cab", out) {
        // A cabinet may contain compressed application binaries or only data.
        // The cabinet index does not declare CPU architecture.
        if !has_installer && folders.iter().all(|f| f.codec == 0) {
            windows.payload_status = None;
        }
        windows.set_result(out);
    }
    Ok(())
}

struct Block {
    logical: u64,
    physical: u64,
    length: u64,
}

struct Blocks<'a, S> {
    input: &'a mut S,
    folder: &'a Folder,
    block_reserve: u64,
    size: u64,
    index: Vec<Block>,
}

impl<S: ReadAt> ReadAt for Blocks<'_, S> {
    fn size(&self) -> u64 {
        u64::from(self.folder.blocks) * 32768
    }

    fn remaining_budget(&self) -> u64 {
        self.input.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, length: usize) -> Result<Vec<u8>> {
        check_range(self.size(), offset, length as u64)?;
        let end = offset + length as u64;
        while self
            .index
            .last()
            .is_none_or(|block| block.logical + block.length < end)
        {
            if self.index.len() >= usize::from(self.folder.blocks).min(2048) {
                return Err(ScanError::Limit("Cabinet data block index"));
            }
            let (logical, position) = self.index.last().map_or((0, self.folder.data), |block| {
                (block.logical + block.length, block.physical + block.length)
            });
            check_range(self.size, position, 8 + self.block_reserve)?;
            let header = self.input.read_at(position, 8).await?;
            let len = u64::from(le16(&header, 4));
            if len == 0 || len > 32768 || len != u64::from(le16(&header, 6)) {
                return Err(INVALID);
            }
            let physical = position + 8 + self.block_reserve;
            check_range(self.size, physical, len)?;
            self.index.push(Block {
                logical,
                physical,
                length: len,
            });
        }
        let mut result = Vec::with_capacity(length);
        for block in &self.index {
            let start = offset.max(block.logical);
            let stop = end.min(block.logical + block.length);
            if start < stop {
                result.extend(
                    self.input
                        .read_at(
                            block.physical + start - block.logical,
                            (stop - start) as usize,
                        )
                        .await?,
                );
            }
        }
        Ok(result)
    }
}

use super::{DotNet, Windows, installer, version};
use crate::{ReadAt, Result, ScanError, check_range, le16, le32, le64};

const BAD_PE: ScanError = ScanError::Invalid("PE image header");
const OUTSIDE_PREFIX: &str = "PE metadata outside the compressed prefix";
const PREFIX_BYTES: u64 = 16 * 1024;

/// A single decoder pass is enough to read most PE headers. Version and
/// hybrid metadata that lie deeper in a compressed member remain optional.
pub(crate) async fn inspect_prefix(input: &mut impl ReadAt, out: &mut Windows) -> Result<()> {
    let size = input.size();
    let bytes = input.read_at(0, size.min(PREFIX_BYTES) as usize).await?;
    let result = inspect(&mut Prefix { size, bytes }, out).await;
    match result {
        Err(ScanError::Unsupported(OUTSIDE_PREFIX)) if out.machine.is_some() => Ok(()),
        other => other,
    }
}

struct Prefix {
    size: u64,
    bytes: Vec<u8>,
}

impl ReadAt for Prefix {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, length: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, length as u64)?;
        let end = offset + length as u64;
        if end > self.bytes.len() as u64 {
            return Err(ScanError::Unsupported(OUTSIDE_PREFIX));
        }
        Ok(self.bytes[offset as usize..end as usize].to_vec())
    }
}

pub(super) struct Section {
    pub(super) name: [u8; 8],
    rva: u32,
    pub(super) offset: u64,
    pub(super) size: u32,
}

pub(super) struct Image {
    is_64: bool,
    base: u64,
    pub(super) headers: u32,
    directories: Vec<(u32, u32)>,
    pub(super) sections: Vec<Section>,
}

impl Image {
    pub(super) fn region(&self, rva: u32, len: u32) -> Option<(u64, u32)> {
        if rva < self.headers && len <= self.headers - rva {
            return Some((rva.into(), self.headers - rva));
        }
        self.sections.iter().find_map(|s| {
            let delta = rva.checked_sub(s.rva)?;
            let remaining = s.size.checked_sub(delta)?;
            (remaining >= len).then_some((s.offset + u64::from(delta), remaining))
        })
    }

    pub(super) fn directory(&self, i: usize) -> Option<(u32, u32)> {
        self.directories
            .get(i)
            .copied()
            .filter(|&(rva, size)| rva != 0 && size != 0)
    }

    fn va_region(&self, va: u64, len: u32) -> Option<(u64, u32)> {
        self.region(u32::try_from(va.checked_sub(self.base)?).ok()?, len)
    }
}

pub(crate) async fn inspect(input: &mut impl ReadAt, out: &mut Windows) -> Result<()> {
    let dos = input.read_at(0, 64).await?;
    let pe = u64::from(le32(&dos, 60));
    if !dos.starts_with(b"MZ") || pe < 64 {
        return Err(BAD_PE);
    }
    let coff = input.read_at(pe, 24).await?;
    if !coff.starts_with(b"PE\0\0") || le16(&coff, 22) & 2 == 0 {
        return Err(BAD_PE);
    }
    let machine = le16(&coff, 4);
    let section_count = usize::from(le16(&coff, 6));
    let optional_size = usize::from(le16(&coff, 20));
    if section_count > 96 || !(96..=4096).contains(&optional_size) {
        return Err(BAD_PE);
    }
    let headers = input
        .read_at(pe + 24, optional_size + section_count * 40)
        .await?;
    let (directory_offset, base, is_64) = match le16(&headers, 0) {
        0x10b => (96, u64::from(le32(&headers, 28)), false),
        0x20b if optional_size >= 112 => (112, le64(&headers, 24), true),
        _ => return Err(BAD_PE),
    };
    let directory_count = le32(&headers, directory_offset - 4) as usize;
    let directories = headers[directory_offset..optional_size]
        .chunks_exact(8)
        .take(directory_count.min(16))
        .map(|d| (le32(d, 0), le32(d, 4)))
        .collect();
    let sections = headers[optional_size..]
        .chunks_exact(40)
        .map(|s| Section {
            name: s[..8].try_into().unwrap(),
            rva: le32(s, 12),
            size: le32(s, 16),
            offset: le32(s, 20).into(),
        })
        .collect();
    let image = Image {
        is_64,
        base,
        headers: le32(&headers, 60),
        directories,
        sections,
    };
    out.machine = Some(machine);
    out.subsystem = Some(le16(&headers, 68));
    let machine_arch = match machine {
        0x014c => Some("x86"),
        0x8664 => Some("x64"),
        0xaa64 => Some("arm64"),
        0xa641 => Some("arm64ec"),
        0xa64e => Some("arm64x"),
        0x01c0 | 0x01c4 => Some("arm32"),
        0x0200 => Some("ia64"),
        _ => None,
    };
    if let Some(arch) = machine_arch {
        out.observe(arch);
        out.architecture_source = Some("pe_machine");
    }
    let dotnet = read_clr(input, &image, machine).await?;
    let hybrid = read_hybrid(input, &image, machine).await?;
    let arch = hybrid.or_else(|| {
        if dotnet.as_ref().is_some_and(|d| d.any_cpu) {
            Some("anycpu")
        } else {
            machine_arch
        }
    });
    out.dotnet = dotnet;
    out.architectures.clear();
    out.main_architecture = arch;
    if let Some(arch) = arch {
        out.observe(arch);
    }
    if arch.is_some() {
        out.architecture_source = Some("pe_headers");
    }
    let from_version = match read_version(input, &image, out).await {
        Err(ScanError::Unsupported(OUTSIDE_PREFIX)) => None,
        other => other?,
    };
    if le16(&coff, 22) & 0x2000 == 0 {
        installer::identify(input, &image, &dos, out, from_version).await?;
    }
    Ok(())
}

async fn read_clr(input: &mut impl ReadAt, image: &Image, machine: u16) -> Result<Option<DotNet>> {
    let Some((rva, size)) = image.directory(14).filter(|&(_, size)| size >= 72) else {
        return Ok(None);
    };
    let Some((offset, _)) = image.region(rva, 72) else {
        return Ok(None);
    };
    let clr = input.read_at(offset, 24).await?;
    if !(72..=size).contains(&le32(&clr, 0)) {
        return Ok(None);
    }
    let flags = le32(&clr, 16);
    let il_only = flags & 1 != 0;
    // ECMA-335 uses the combination 0x20002 for 32-bit preferred.
    let prefers_32bit = flags & 0x20002 == 0x20002;
    let requires_32bit = flags & 2 != 0 && !prefers_32bit;
    Ok(Some(DotNet {
        il_only,
        any_cpu: machine == 0x014c && !image.is_64 && il_only && !requires_32bit,
        requires_32bit,
        prefers_32bit,
    }))
}

async fn read_hybrid(
    input: &mut impl ReadAt,
    image: &Image,
    machine: u16,
) -> Result<Option<&'static str>> {
    if !image.is_64 || !matches!(machine, 0xaa64 | 0x8664) {
        return Ok(None);
    }
    let Some((rva, size)) = image.directory(10) else {
        return Ok(None);
    };
    let size = size.min(230);
    let Some((offset, _)) = image.region(rva, size) else {
        return Ok(None);
    };
    if size < 4 {
        return Ok(None);
    }
    let cfg = input.read_at(offset, size as usize).await?;
    let cfg = &cfg[..cfg.len().min(le32(&cfg, 0) as usize)];
    if machine == 0xaa64 && cfg.len() >= 200 {
        let by_section = if cfg.len() >= 230 {
            usize::from(le16(cfg, 228))
                .checked_sub(1)
                .and_then(|i| image.sections.get(i))
                .and_then(|section| {
                    let delta = le32(cfg, 224);
                    Some((
                        section.offset + u64::from(delta),
                        section.size.checked_sub(delta)?,
                    ))
                })
        } else {
            None
        };
        if let Some((offset, remaining)) = by_section.or_else(|| image.va_region(le64(cfg, 192), 8))
            && has_arm64x_relocations(input, offset, remaining).await?
        {
            return Ok(Some("arm64x"));
        }
    }
    if machine == 0x8664
        && cfg.len() >= 208
        && let Some((offset, _)) = image.va_region(le64(cfg, 200), 20)
    {
        let chpe = input.read_at(offset, 20).await?;
        let entries = le32(&chpe, 8);
        if le32(&chpe, 0) != 0
            && entries != 0
            && entries
                .checked_mul(8)
                .is_some_and(|size| image.region(le32(&chpe, 4), size).is_some())
        {
            return Ok(Some("arm64ec"));
        }
    }
    Ok(None)
}

async fn has_arm64x_relocations(
    input: &mut impl ReadAt,
    offset: u64,
    remaining: u32,
) -> Result<bool> {
    if remaining < 8 || check_range(input.size(), offset, remaining.into()).is_err() {
        return Ok(false);
    }
    let table = input.read_at(offset, 8).await?;
    let version = le32(&table, 0);
    let size = le32(&table, 4);
    let min_header = match version {
        1 => 12,
        2 => 24,
        _ => return Ok(false),
    };
    if size > remaining - 8 {
        return Ok(false);
    }
    let mut cursor = 0;
    for _ in 0..32 {
        if size - cursor < min_header {
            break;
        }
        let record = input
            .read_at(offset + 8 + u64::from(cursor), min_header as usize)
            .await?;
        let (symbol, header_size, fixup_size) = if version == 1 {
            (le64(&record, 0), min_header, le32(&record, 8))
        } else {
            (le64(&record, 8), le32(&record, 0), le32(&record, 4))
        };
        if header_size < min_header
            || header_size > size - cursor
            || fixup_size > size - cursor - header_size
        {
            break;
        }
        if symbol == 6 && fixup_size >= 10 {
            let block_offset = offset + 8 + u64::from(cursor) + u64::from(header_size);
            let block = input.read_at(block_offset, 8).await?;
            let block_size = le32(&block, 4);
            if (10..=fixup_size).contains(&block_size)
                && block_size.is_multiple_of(2)
                && le32(&block, 0).is_multiple_of(4096)
            {
                return Ok(true);
            }
        }
        cursor += header_size + fixup_size;
    }
    Ok(false)
}

async fn read_version(
    input: &mut impl ReadAt,
    image: &Image,
    out: &mut Windows,
) -> Result<Option<&'static str>> {
    let Some((rva, size)) = image.directory(2) else {
        return Ok(None);
    };
    let Some((base, remaining)) = image.region(rva, 16) else {
        return Ok(None);
    };
    let size = size.min(remaining);
    let Some((data_rva, data_size)) =
        version::locate(input, base, size, version::ResourceType::Number(16), None).await?
    else {
        return Ok(None);
    };
    if !(6..=65535).contains(&data_size) {
        return Ok(None);
    }
    if let Some((offset, _)) = image.region(data_rva, data_size) {
        let bytes = input.read_at(offset, data_size as usize).await?;
        return Ok(version::apply(&bytes, out));
    }
    Ok(None)
}

use crate::{
    Architecture, ReadAt, Result, ScanError, be32, check_range,
    diagnostic::{Command, ExecutableDiagnostic, Prefix, SliceCommands},
    le32,
};
use std::collections::BTreeMap;

#[derive(Clone, Copy)]
pub(crate) struct Kind {
    big: bool,
    wide: bool,
    fat: bool,
}

impl Kind {
    fn word(self, bytes: &[u8], offset: usize) -> u32 {
        if self.big {
            be32(bytes, offset)
        } else {
            le32(bytes, offset)
        }
    }

    fn long(self, bytes: &[u8], offset: usize) -> u64 {
        let a = self.word(bytes, offset) as u64;
        let b = self.word(bytes, offset + 4) as u64;
        if self.big {
            (a << 32) | b
        } else {
            (b << 32) | a
        }
    }
}

pub(crate) fn kind(bytes: &[u8]) -> Option<Kind> {
    let magic = u32::from_be_bytes(bytes.get(..4)?.try_into().ok()?);
    let (big, wide, fat) = match magic {
        0xfeedface => (true, false, false),
        0xfeedfacf => (true, true, false),
        0xcefaedfe => (false, false, false),
        0xcffaedfe => (false, true, false),
        0xcafebabe => (true, false, true),
        0xcafebabf => (true, true, true),
        0xbebafeca => (false, false, true),
        0xbfbafeca => (false, true, true),
        _ => return None,
    };
    Some(Kind { big, wide, fat })
}

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    out: &mut Vec<Architecture>,
    diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    if let Some(diagnostic) = diagnostic {
        *diagnostic = ExecutableDiagnostic::default();
        let mut prefixed = Prefix::open(input, diagnostic).await?;
        inspect(&mut prefixed, out, Some(diagnostic)).await
    } else {
        inspect(input, out, None).await
    }
}

async fn inspect(
    input: &mut impl ReadAt,
    out: &mut Vec<Architecture>,
    diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    let first = input.read_at(0, 8).await?;
    scan_after_header(input, &first, out, diagnostic).await
}

pub(crate) async fn scan_after_header(
    input: &mut impl ReadAt,
    first: &[u8],
    out: &mut Vec<Architecture>,
    mut diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    let size = input.size();
    let kind = kind(first).ok_or_else(|| {
        if first.starts_with(b"#!") {
            ScanError::Unsupported("declared executable is a script")
        } else if first.starts_with(b"MZ") {
            ScanError::Unsupported("declared executable has DOS/PE magic")
        } else if first.starts_with(b"\x7fELF") {
            ScanError::Unsupported("declared executable is ELF")
        } else {
            ScanError::Invalid("executable is not Mach-O")
        }
    })?;
    if !kind.fat {
        return thin(input, 0, size, first, None, out, diagnostic).await;
    }

    let count = kind.word(first, 4) as usize;
    if !(1..=128).contains(&count) {
        return Err(ScanError::Invalid("Mach-O fat slice count"));
    }
    let record_size = if kind.wide { 32 } else { 20 };
    let table_end = 8 + (count * record_size) as u64;
    let prefix = &first[8..];
    let mut records = prefix.to_vec();
    records.extend(
        input
            .read_at(first.len() as u64, count * record_size - prefix.len())
            .await?,
    );
    let mut arches = Vec::with_capacity(count);
    for record in records.chunks_exact(record_size) {
        let (offset, length) = if kind.wide {
            (kind.long(record, 8), kind.long(record, 16))
        } else {
            (kind.word(record, 8) as u64, kind.word(record, 12) as u64)
        };
        if offset < table_end || length < 28 {
            return Err(ScanError::Invalid("Mach-O fat slice extent"));
        }
        check_range(size, offset, length)?;
        arches.push(architecture(
            kind.word(record, 0),
            kind.word(record, 4),
            offset,
            length,
        ));
    }

    let mut order: Vec<usize> = (0..arches.len()).collect();
    order.sort_unstable_by_key(|i| arches[*i].offset);
    if order.windows(2).any(|pair| {
        let left = &arches[pair[0]];
        left.offset + left.size > arches[pair[1]].offset
    }) {
        return Err(ScanError::Invalid("overlapping Mach-O fat slices"));
    }
    *out = arches;

    // Visit slices by file position so a compressed member only inflates forward.
    for index in order {
        let (offset, length) = (out[index].offset, out[index].size);
        let first = input.read_at(offset, 8).await?;
        thin(
            input,
            offset,
            length,
            &first,
            Some(index),
            out,
            diagnostic.as_deref_mut(),
        )
        .await?;
    }
    Ok(())
}

fn architecture(cpu_type: u32, cpu_subtype: u32, offset: u64, size: u64) -> Architecture {
    let name = match (cpu_type, cpu_subtype & 0x00ff_ffff) {
        (0x0100000c, 2) => "arm64e",
        (0x0100000c, _) => "arm64",
        (0x01000007, _) => "x86_64",
        (7, _) => "i386",
        (12, _) => "arm",
        (0x0200000c, _) => "arm64_32",
        (18, _) => "ppc",
        (0x01000012, _) => "ppc64",
        _ => "unknown",
    };
    Architecture {
        name,
        cpu_type,
        cpu_subtype,
        offset,
        size,
        header_verified: false,
        min_macos: None,
        code_signature_present: None,
    }
}

async fn thin(
    input: &mut impl ReadAt,
    offset: u64,
    size: u64,
    first: &[u8],
    index: Option<usize>,
    out: &mut Vec<Architecture>,
    diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    let kind = kind(first)
        .filter(|k| !k.fat)
        .ok_or(ScanError::Invalid("invalid thin Mach-O magic in slice"))?;
    let header_size = if kind.wide { 32 } else { 28 };
    check_range(size, 0, header_size as u64)?;
    let rest = input.read_at(offset + 8, header_size - 8).await?;
    let cpu = kind.word(first, 4);
    let subtype = kind.word(&rest, 0);
    let arch = if let Some(index) = index {
        let arch = &mut out[index];
        if arch.cpu_type != cpu || (arch.cpu_subtype ^ subtype) & 0x00ff_ffff != 0 {
            return Err(ScanError::Invalid(
                "Mach-O slice CPU differs from fat table",
            ));
        }
        arch
    } else {
        out.push(architecture(cpu, subtype, offset, size));
        out.last_mut().unwrap()
    };
    arch.header_verified = true;

    let trace = diagnostic.map(|value| {
        value.load_commands.push(SliceCommands {
            slice_offset: offset,
            commands: Vec::new(),
            truncated: true,
        });
        value.load_commands.last_mut().unwrap()
    });
    let count = kind.word(&rest, 8);
    let length = kind.word(&rest, 12) as usize;
    if length > 1024 * 1024 {
        return Err(ScanError::Limit("Mach-O load commands exceed 1 MiB"));
    }
    if count as usize > length / 8 {
        return Err(ScanError::Invalid("Mach-O load command count"));
    }
    check_range(size, header_size as u64, length as u64)?;
    let commands = input.read_at(offset + header_size as u64, length).await?;

    let mut trace = trace;
    let mut pos = 0;
    let mut signed = false;
    let mut build_min = None;
    let mut legacy_min = None;
    for _ in 0..count {
        if commands.len() - pos < 8 {
            return Err(ScanError::Invalid("truncated Mach-O load command"));
        }
        let cmd = kind.word(&commands, pos);
        let len = kind.word(&commands, pos + 4) as usize;
        if !(8..=commands.len() - pos).contains(&len) || !len.is_multiple_of(4) {
            return Err(ScanError::Invalid("invalid Mach-O load command size"));
        }
        if let Some(trace) = &mut trace {
            trace.commands.push(Command {
                id: cmd,
                size: len as u32,
                fields: command_fields(kind, cmd, &commands[pos..pos + len]),
            });
        }
        match cmd {
            0x1d | 0x24 if len < 16 => return Err(ScanError::Invalid("short Mach-O load command")),
            0x32 if len < 24 => {
                return Err(ScanError::Invalid("short Mach-O build version command"));
            }
            0x1d => signed = true,
            0x24 => legacy_min = Some(version(kind.word(&commands, pos + 8))),
            0x32 if kind.word(&commands, pos + 8) == 1 => {
                build_min = Some(version(kind.word(&commands, pos + 12)));
            }
            _ => {}
        }
        pos += len;
    }
    if pos != length {
        return Err(ScanError::Invalid("unused bytes in Mach-O load commands"));
    }
    if let Some(trace) = trace {
        trace.truncated = false;
    }
    arch.min_macos = build_min.or(legacy_min);
    arch.code_signature_present = Some(signed);
    Ok(())
}

fn command_fields(kind: Kind, cmd: u32, bytes: &[u8]) -> BTreeMap<&'static str, u64> {
    let (width, names): (usize, &[&str]) = match cmd & 0x7fff_ffff {
        0x32 => (4, &["platform", "minimum_os", "sdk", "tool_count"]),
        0x24 | 0x25 | 0x2f | 0x30 => (4, &["minimum_os", "sdk"]),
        0x1d | 0x1e | 0x26 | 0x29 | 0x2b | 0x2e | 0x33 | 0x34 => (4, &["data_offset", "data_size"]),
        0x28 => (8, &["entry_offset", "stack_size"]),
        0x02 => (
            4,
            &[
                "symbol_offset",
                "symbol_count",
                "string_offset",
                "string_size",
            ],
        ),
        0x0c | 0x0d | 0x18 | 0x1f | 0x20 | 0x23 => (
            4,
            &[
                "name_offset",
                "timestamp",
                "current_version",
                "compatibility_version",
            ],
        ),
        0x22 => (
            4,
            &[
                "rebase_offset",
                "rebase_size",
                "bind_offset",
                "bind_size",
                "weak_bind_offset",
                "weak_bind_size",
                "lazy_bind_offset",
                "lazy_bind_size",
                "export_offset",
                "export_size",
            ],
        ),
        0x01 | 0x19 => {
            let wide = cmd == 0x19;
            let width = if wide { 8 } else { 4 };
            let mut fields = BTreeMap::new();
            for (index, name) in ["vm_address", "vm_size", "file_offset", "file_size"]
                .into_iter()
                .enumerate()
            {
                let start = 24 + index * width;
                if start + width <= bytes.len() {
                    fields.insert(
                        name,
                        if wide {
                            kind.long(bytes, start)
                        } else {
                            u64::from(kind.word(bytes, start))
                        },
                    );
                }
            }
            let count_at = if wide { 64 } else { 48 };
            if count_at + 4 <= bytes.len() {
                fields.insert("section_count", u64::from(kind.word(bytes, count_at)));
            }
            return fields;
        }
        _ => (4, &[]),
    };
    names
        .iter()
        .enumerate()
        .filter_map(|(index, name)| {
            let at = 8 + index * width;
            (at + width <= bytes.len()).then(|| {
                let value = if width == 8 {
                    kind.long(bytes, at)
                } else {
                    u64::from(kind.word(bytes, at))
                };
                (*name, value)
            })
        })
        .collect()
}

fn version(packed: u32) -> String {
    let (major, minor, patch) = (packed >> 16, (packed >> 8) & 0xff, packed & 0xff);
    if patch == 0 {
        format!("{major}.{minor}")
    } else {
        format!("{major}.{minor}.{patch}")
    }
}

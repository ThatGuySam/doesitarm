use super::{Deadline, FileSource, ready, source_error};
use scan_core::{
    BinaryInventory, Result, ScanError, ScanLimits, ScanResult, Status, Target,
    bundle_binary_is_macho, bundle_binary_role, scan_target_with_deadline,
};
use std::{fs, io::Read, path::Path};

const DEADLINE: ScanError = ScanError::WorkLimit("scan deadline reached");

pub(crate) fn inventory(
    root: &Path,
    main: Option<&str>,
    limits: ScanLimits,
    deadline: Option<Deadline>,
    out: &mut ScanResult,
) {
    let expired = || deadline.is_some_and(Deadline::expired);
    let mut inventory = BinaryInventory::default();
    if !matches!(out.status, Status::Script)
        && let Some(error) = &out.error
    {
        inventory.partial(error.clone());
    }
    let mut inspect_binary = |file: fs::File| {
        let size = file.metadata().map_err(source_error)?.len();
        Ok(ready(scan_target_with_deadline(
            &mut FileSource { file, size },
            limits,
            Target::Auto,
            Some(&expired),
        )))
    };
    let mut pending = vec![("Contents".to_owned(), root.join("Contents"))];
    'walk: while let Some((prefix, directory)) = pending.pop() {
        if expired() {
            inventory.partial(DEADLINE.to_string());
            break;
        }
        let children = match fs::read_dir(directory) {
            Ok(children) => children,
            Err(error) => {
                inventory.partial(error.to_string());
                continue;
            }
        };
        for child in children {
            if expired() {
                inventory.partial(DEADLINE.to_string());
                break 'walk;
            }
            let Ok(child) = child else {
                inventory.partial("directory entry could not be read");
                continue;
            };
            let name = child.file_name();
            let Some(name) = name.to_str() else {
                inventory.partial("directory entry name is not UTF-8");
                continue;
            };
            let relative = format!("{prefix}/{name}");
            let Some(role) = bundle_binary_role(&relative) else {
                continue;
            };
            let kind = match child.file_type() {
                Ok(kind) => kind,
                Err(error) => {
                    inventory.partial(error.to_string());
                    continue;
                }
            };
            if kind.is_dir() {
                pending.push((relative, child.path()));
                continue;
            }
            if !kind.is_file() || main == Some(relative.as_str()) {
                continue;
            }
            if let Err(error) = inspect_candidate(
                &root,
                &relative,
                role,
                &mut inventory,
                out,
                &mut inspect_binary,
            ) {
                inventory.partial(error.to_string());
            }
        }
    }
    inventory.finish(main, &out.architectures);
    out.inventory = Some(inventory);
}

fn inspect_candidate(
    root: &Path,
    path: &str,
    role: &'static str,
    inventory: &mut BinaryInventory,
    out: &mut ScanResult,
    scan: &mut impl FnMut(fs::File) -> Result<ScanResult>,
) -> Result<()> {
    let mut file = open_inside(root, path)?;
    let size = file.metadata().map_err(source_error)?.len();
    if size < 8 {
        return Ok(());
    }
    let mut header = [0; 12];
    let header = &mut header[..size.min(12) as usize];
    file.read_exact(header).map_err(source_error)?;
    if !bundle_binary_is_macho(header) {
        out.total_size += size;
        out.bytes_read += header.len() as u64;
        out.bytes_requested += header.len() as u64;
        out.reads += 1;
        return Ok(());
    }
    let binary = scan(file)?;
    out.bytes_requested += header.len() as u64;
    out.reads += 1;
    account(out, &binary);
    if let Some(error) = binary.error {
        inventory.partial(error);
    }
    inventory.push(path.to_owned(), role, binary.architectures);
    Ok(())
}

fn open_inside(root: &Path, path: &str) -> Result<fs::File> {
    let path = root.join(path).canonicalize().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ScanError::NotFound("declared file in app directory")
        } else {
            source_error(error)
        }
    })?;
    if !path.starts_with(root) || !path.is_file() {
        return Err(ScanError::Unsupported(
            "app file resolves outside its bundle",
        ));
    }
    fs::File::open(path).map_err(source_error)
}

fn account(out: &mut ScanResult, binary: &ScanResult) {
    out.total_size += binary.total_size;
    out.bytes_read += binary.bytes_read;
    out.bytes_requested += binary.bytes_requested;
    out.reads += binary.reads;
}

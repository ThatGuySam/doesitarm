use super::{Deadline, FileSource, failure, ready, source_error};
use scan_core::{
    BinaryInventory, Profile, Result, ScanError, ScanLimits, ScanResult, Target,
    bundle_binary_is_macho, bundle_binary_role, bundle_metadata, scan_target_with_deadline,
};
use std::{fs, io::Read, path::Path};

const MAX_PLIST: u64 = 2 * 1024 * 1024;
const PLIST: &str = "Contents/Info.plist";
const DEADLINE: ScanError = ScanError::WorkLimit("scan deadline reached");

pub(crate) fn scan_app(
    path: &Path,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
) -> ScanResult {
    if limits.profile != Profile::Local || !matches!(target, Target::Auto) {
        return failure(
            ScanError::Unsupported(
                "app directory requires the local profile and its own bundle target",
            ),
            0,
        );
    }
    let Some(label) = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| name.ends_with(".app"))
    else {
        return failure(
            ScanError::Unsupported("directory input must be a .app bundle"),
            0,
        );
    };
    match inspect(path, label, limits, deadline) {
        Ok(result) => result,
        Err(error) => failure(error, 0),
    }
}

fn inspect(
    path: &Path,
    label: &str,
    limits: ScanLimits,
    deadline: Option<Deadline>,
) -> Result<ScanResult> {
    let root = path.canonicalize().map_err(source_error)?;
    let expired = || deadline.is_some_and(Deadline::expired);
    if expired() {
        return Err(DEADLINE);
    }
    let file = open_inside(&root, PLIST)?;
    let mut data = Vec::new();
    file.take(MAX_PLIST + 1)
        .read_to_end(&mut data)
        .map_err(source_error)?;
    let mut out = bundle_metadata(&data, label);
    if out.error.is_some() {
        return Ok(out);
    }
    let Some(path) = out.executable_path.as_deref() else {
        return Ok(out);
    };
    let mut main = path[label.len() + 1..].to_owned();
    if !root.join(&main).is_file()
        && let Some(leaf) = main.strip_prefix("Contents/MacOS/MacOS/")
    {
        let alias = format!("Contents/MacOS/{leaf}");
        if root.join(&alias).is_file() {
            main = alias;
            out.executable_path = Some(format!("{label}/{main}"));
            out.executable_resolution = Some("contents_relative");
        }
    }
    let mut inventory = BinaryInventory::default();
    let mut inspect_binary = |file: fs::File| {
        let size = file.metadata().map_err(source_error)?.len();
        Ok(ready(scan_target_with_deadline(
            &mut FileSource { file, size },
            limits,
            Target::Auto,
            Some(&expired),
        )))
    };

    match open_inside(&root, &main).and_then(inspect_binary) {
        Ok(binary) => {
            account(&mut out, &binary);
            out.status = binary.status;
            if binary
                .error
                .as_deref()
                .is_some_and(|err| err != "unsupported: declared executable is a script")
            {
                inventory.partial(binary.error.as_ref().unwrap().to_owned());
            }
            out.error = binary.error;
            out.executable_size = Some(binary.total_size);
            out.architectures = binary.architectures;
            if out.min_macos.is_none() {
                out.min_macos = binary.min_macos;
            }
        }
        Err(error) => {
            inventory.partial(error.to_string());
            out.set_error(error);
        }
    }

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
            if !kind.is_file() || relative == main {
                continue;
            }
            if let Err(error) = inspect_candidate(
                &root,
                &relative,
                role,
                &mut inventory,
                &mut out,
                &mut inspect_binary,
            ) {
                inventory.partial(error.to_string());
            }
        }
    }
    inventory.finish(Some(&main), &out.architectures);
    out.inventory = Some(inventory);
    Ok(out)
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

use super::{Deadline, FileSource, ready};
use scan_core::{
    ScanLimits, ScanResult, Status, Target, local_bundle_metadata, scan_target_with_deadline,
};
use serde::Serialize;
use std::{
    fs::{self, File, ReadDir},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    rc::Rc,
    time::{Duration, Instant},
};

const MAX_PLIST: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
struct Row {
    display_path: String,
    parent_bundle_path: Option<String>,
    bundle_role: Option<&'static str>,
    error_class: Option<&'static str>,
    executable_resolution: Option<&'static str>,
    #[serde(flatten)]
    result: ScanResult,
}

impl Row {
    fn new(path: String, parent: Option<String>, result: ScanResult) -> Self {
        Self {
            display_path: path,
            parent_bundle_path: parent,
            bundle_role: None,
            error_class: None,
            executable_resolution: None,
            result,
        }
    }
}

fn name(path: &Path) -> String {
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}

fn is_app(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
}

fn is_archive(path: &Path) -> bool {
    let leaf = name(path).to_ascii_lowercase();
    [
        ".dmg", ".zip", ".pkg", ".tar", ".tar.gz", ".tgz", ".tar.xz", ".tar.bz2",
    ]
    .iter()
    .any(|extension| leaf.ends_with(extension))
}

fn is_macho(path: &Path) -> bool {
    let mut magic = [0; 4];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut magic))
        .is_ok()
        && matches!(
            u32::from_be_bytes(magic),
            0xfeedface
                | 0xcefaedfe
                | 0xfeedfacf
                | 0xcffaedfe
                | 0xcafebabe
                | 0xbebafeca
                | 0xcafebabf
                | 0xbfbafeca
        )
}

fn scan_file(path: &Path, limits: ScanLimits, deadline: Option<Deadline>) -> ScanResult {
    match FileSource::open(path) {
        Ok(mut file) => {
            let expired = || deadline.is_some_and(Deadline::expired);
            ready(scan_target_with_deadline(
                &mut file,
                limits,
                Target::Auto,
                deadline.map(|_| &expired as &dyn Fn() -> bool),
            ))
        }
        Err(error) => super::failure(error, 0),
    }
}

fn app_member(root: &Path, relative: &str) -> io::Result<PathBuf> {
    let path = root.join(relative).canonicalize()?;
    if path.starts_with(root) {
        Ok(path)
    } else {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "bundle member resolves outside the app",
        ))
    }
}

fn role_hint(bundle: &Path) -> &'static str {
    let wrapper = app_member(bundle, "Wrapper")
        .ok()
        .and_then(|path| fs::read_dir(path).ok())
        .is_some_and(|entries| {
            entries.flatten().any(|entry| {
                entry.file_type().is_ok_and(|kind| kind.is_dir()) && is_app(&entry.path())
            })
        });
    if wrapper {
        return "wrapper";
    }
    let resources = app_member(bundle, "Contents/Resources").is_ok_and(|path| path.is_dir());
    let code = app_member(bundle, "Contents/MacOS")
        .ok()
        .and_then(|path| fs::read_dir(path).ok())
        .is_some_and(|mut entries| entries.next().is_some());
    if resources && !code {
        "resource_only"
    } else {
        ""
    }
}

fn bundle_plist(root: &Path) -> io::Result<(&'static str, File)> {
    for relative in ["Contents/Info.plist", "Info.plist"] {
        match app_member(root, relative).and_then(File::open) {
            Ok(file) => return Ok((relative, file)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "app has no Info.plist",
    ))
}

fn bundle_row(
    root: &Path,
    display: String,
    parent: Option<String>,
    limits: ScanLimits,
    deadline: Option<Deadline>,
) -> Row {
    let mut row = bundle_primary(root, display, parent, limits, deadline);
    let main = row
        .result
        .executable_path
        .as_deref()
        .and_then(|path| path.strip_prefix(&row.display_path))
        .and_then(|path| path.strip_prefix('/'))
        .map(str::to_owned);
    super::local::inventory(root, main.as_deref(), limits, deadline, &mut row.result);
    row
}

fn bundle_primary(
    root: &Path,
    display: String,
    parent: Option<String>,
    limits: ScanLimits,
    deadline: Option<Deadline>,
) -> Row {
    let role = role_hint(root);
    let mut result = ScanResult::new(0);
    result.format = Some("app");
    result.bundle_path = Some(display.clone());
    let mut row = Row::new(display, parent, result);
    row.bundle_role = Some(if role == "wrapper" {
        role
    } else if row.parent_bundle_path.is_some() {
        "nested_app"
    } else {
        "app"
    });

    let (plist_path, file) = match bundle_plist(root) {
        Ok(found) => found,
        Err(error) => {
            let missing = error.kind() == io::ErrorKind::NotFound;
            let (status, class) = if missing && role == "wrapper" {
                (Status::NoExecutable, "wrapper_bundle")
            } else if missing {
                (Status::NotFound, "missing_info_plist")
            } else {
                (Status::SourceError, "unreadable_info_plist")
            };
            set_outcome(&mut row, status, class, error.to_string());
            return row;
        }
    };
    let mut bytes = Vec::new();
    if let Err(error) = file.take(MAX_PLIST + 1).read_to_end(&mut bytes) {
        set_outcome(
            &mut row,
            Status::SourceError,
            "unreadable_info_plist",
            error.to_string(),
        );
        return row;
    }
    let metadata = local_bundle_metadata(
        &bytes,
        &row.display_path,
        plist_path,
        row.parent_bundle_path.is_some(),
        role,
    );
    row.result = metadata.result;
    row.bundle_role = Some(metadata.bundle_role);
    row.error_class = metadata.error_class;
    let fallback = metadata.executable_resolution == Some("bundle_name_fallback");
    let Some(mut relative) = metadata.executable_relative_path else {
        return row;
    };

    let mut resolution = metadata.executable_resolution;
    let mut member = app_member(root, &relative);
    if matches!(&member, Err(error) if error.kind() == io::ErrorKind::NotFound)
        && let Some(leaf) = relative.strip_prefix("Contents/MacOS/MacOS/")
    {
        let alias = format!("Contents/MacOS/{leaf}");
        if let Ok(path) = app_member(root, &alias) {
            member = Ok(path);
            relative = alias;
            resolution = Some("contents_relative");
        }
    }
    let executable = match member {
        Ok(path) if path.is_file() => path,
        Err(error) if error.kind() != io::ErrorKind::NotFound => {
            set_outcome(
                &mut row,
                Status::SourceError,
                "unreadable_executable",
                error.to_string(),
            );
            return row;
        }
        _ => {
            if !fallback {
                set_outcome(
                    &mut row,
                    Status::NoExecutable,
                    "missing_executable_file",
                    "The executable named in Info.plist is missing from the selected app.".into(),
                );
            }
            return row;
        }
    };

    let mut primary = scan_file(&executable, limits, deadline);
    let result = &mut row.result;
    result.executable_size = Some(primary.total_size);
    result.executable_path = Some(format!("{}/{relative}", row.display_path));
    result.total_size += primary.total_size;
    result.bytes_read += primary.bytes_read;
    result.bytes_requested += primary.bytes_requested;
    result.reads += primary.reads;
    result.decoded_bytes = primary.decoded_bytes;
    let verified = primary.format == Some("macho")
        && matches!(primary.status, Status::Complete)
        && primary
            .architectures
            .iter()
            .any(|arch| arch.header_verified);
    if fallback && !verified {
        return row;
    }

    row.executable_resolution = resolution;
    let mut prefix = [0; 2];
    if !fallback
        && File::open(&executable)
            .and_then(|mut file| file.read_exact(&mut prefix))
            .is_ok()
        && &prefix == b"#!"
    {
        primary.status = Status::Script;
        primary.error = Some(
            "CFBundleExecutable is a script. Its file does not declare a Mach-O architecture."
                .into(),
        );
        row.error_class = Some("executable_is_script");
    } else if primary.format != Some("macho") && matches!(primary.status, Status::Complete) {
        primary.status = Status::Invalid;
        primary.error =
            Some("CFBundleExecutable names a file that is not a Mach-O executable.".into());
        primary.architectures.clear();
        row.error_class = Some("executable_not_macho");
    } else {
        row.error_class = None;
    }
    result.status = primary.status;
    result.error = primary.error;
    result.architectures = primary.architectures;
    result.min_macos = result.min_macos.take().or(primary.min_macos);
    row
}

fn set_outcome(row: &mut Row, status: Status, class: &'static str, error: String) {
    row.result.status = status;
    row.result.error = Some(error);
    row.error_class = Some(class);
}

struct Frame {
    path: String,
    app: Option<Rc<Bundle>>,
    entries: ReadDir,
}

struct Bundle {
    path: String,
    executable: Option<String>,
}

pub(crate) fn report(
    path: &Path,
    json: bool,
    limits: ScanLimits,
    timeout: Option<Duration>,
) -> io::Result<bool> {
    let deadline = timeout.map(|duration| Deadline {
        start: Instant::now(),
        duration,
    });
    let root = path.canonicalize()?;
    let label = name(path);
    let mut out = io::BufWriter::new(io::stdout().lock());
    if is_app(path) {
        let row = bundle_row(&root, label, None, limits, deadline);
        print_row(&mut out, &row, json)?;
        writeln!(out)?;
        return Ok(matches!(row.result.status, Status::Complete));
    }
    if json {
        writeln!(out, "[")?;
    }
    let mut first = true;
    let mut stack = vec![Frame {
        path: label,
        app: None,
        entries: fs::read_dir(root)?,
    }];
    while let Some(frame) = stack.last_mut() {
        if deadline.is_some_and(Deadline::expired) {
            eprintln!("Local folder scan reached its deadline.");
            break;
        }
        let Some(entry) = frame.entries.next() else {
            stack.pop();
            continue;
        };
        let frame_path = frame.path.clone();
        let bundle = frame.app.clone();
        let row = (|| -> io::Result<Option<Row>> {
            let entry = entry?;
            let kind = entry.file_type()?;
            let path = entry.path();
            let display = format!("{frame_path}/{}", name(&path));
            let parent = bundle.as_ref().map(|app| &app.path);
            if kind.is_dir() {
                let entries = fs::read_dir(&path)?;
                let row = is_app(&path)
                    .then(|| bundle_row(&path, display.clone(), parent.cloned(), limits, deadline));
                let next_bundle = row.as_ref().map(|row| {
                    Rc::new(Bundle {
                        path: display.clone(),
                        executable: row.result.executable_path.clone(),
                    })
                });
                stack.push(Frame {
                    path: display,
                    app: next_bundle.or(bundle),
                    entries,
                });
                return Ok(row);
            }
            if !kind.is_file() {
                return Ok(None);
            }
            let same_executable =
                bundle.as_ref().and_then(|app| app.executable.as_ref()) == Some(&display);
            if !is_archive(&path) && (same_executable || !is_macho(&path)) {
                return Ok(None);
            }
            Ok(Some(Row::new(
                display,
                parent.cloned(),
                scan_file(&path, limits, deadline),
            )))
        })();
        match row {
            Ok(Some(row)) => {
                if json && !first {
                    writeln!(out, ",")?;
                }
                print_row(&mut out, &row, json)?;
                if !json {
                    writeln!(out)?;
                }
                first = false;
            }
            Ok(None) => {}
            Err(error) => eprintln!("Could not enumerate a local entry: {error}"),
        }
    }
    if json {
        writeln!(out, "\n]")?;
    }
    out.flush()?;
    Ok(!deadline.is_some_and(Deadline::expired))
}

fn print_row(out: &mut impl Write, row: &Row, json: bool) -> io::Result<()> {
    if json {
        serde_json::to_writer(out, row)?;
    } else {
        let result = &row.result;
        let architectures = result
            .architectures
            .iter()
            .filter(|arch| arch.header_verified)
            .map(|arch| arch.name)
            .collect::<Vec<_>>()
            .join(", ");
        write!(
            out,
            "{}\t{:?}\t{}\t{} bytes read",
            row.display_path, result.status, architectures, result.bytes_read
        )?;
        if let Some(error) = &result.error {
            write!(out, "\t{error}")?;
        }
    }
    Ok(())
}

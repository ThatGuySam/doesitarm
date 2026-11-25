use crate::{Result, ScanError, ScanResult, Target, plist_value};
use plist::{Dictionary, Value};
use unicode_normalization::UnicodeNormalization;

pub(crate) const MAX_PLIST: u64 = 2 * 1024 * 1024;
const INFO: &str = "/Contents/Info.plist";

pub(crate) fn archive_path(path: &str) -> Option<&str> {
    let path = path.trim_start_matches("./");
    if path.is_empty()
        || path
            .split('/')
            .any(|name| matches!(name, "." | ".." | "__MACOSX") || name.starts_with("._"))
        || path.starts_with('/')
        || path.contains(['\\', '\0'])
    {
        return None;
    }
    Some(path)
}

pub(crate) fn plist_bundle(path: &str) -> Option<&str> {
    let bundle = path.strip_suffix(INFO)?;
    bundle.ends_with(".app").then_some(bundle)
}

pub(crate) fn outer_app(root: &str) -> bool {
    let parent = root.rsplit_once('/').map_or("", |(parent, _)| parent);
    !parent
        .split('/')
        .any(|part| part == "Contents" || part.ends_with(".app"))
}

pub(crate) fn outer_plist(path: &str) -> Option<&str> {
    plist_bundle(path).filter(|root| outer_app(root))
}

pub(crate) fn selected_plist<'a>(path: &'a str, target: Target<'_>) -> Option<&'a str> {
    match target {
        Target::Auto => outer_plist(path),
        Target::Bundle(asked) => {
            let root = path.strip_suffix(INFO)?;
            matches_path(root, asked).then_some(root)
        }
        Target::Executable(_) => None,
    }
}

pub(crate) fn matches_path(actual: &str, requested: &str) -> bool {
    let Some(requested) = archive_path(requested) else {
        return false;
    };
    let mut actual = actual.rsplit('/');
    requested.rsplit('/').all(|part| {
        actual
            .next()
            .is_some_and(|candidate| candidate == part || candidate.nfc().eq(part.nfc()))
    })
}

pub(crate) const NAME_FALLBACK: &str = "bundle_name_fallback";
const MISSING_EXECUTABLE: ScanError = ScanError::NotFound("CFBundleExecutable in Info.plist");

pub(crate) fn apply_plist(
    bytes: &[u8],
    bundle: &str,
    out: &mut ScanResult,
    allow_fallback: bool,
) -> Result<String> {
    if let Some(diagnostic) = &mut out.diagnostic {
        diagnostic.plist_source(bundle, bytes);
    }
    let raw = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let parsed = plist_value::parse(raw, ScanError::Invalid("bundle Info.plist"))?;
    let resolution = (|| {
        let dict = parsed
            .as_dictionary()
            .ok_or(ScanError::Invalid("Info.plist is not a dictionary"))?;
        apply_properties(dict, bundle, out);
        let relative = if let Some(executable) = string(dict, "CFBundleExecutable") {
            out.executable_name = Some(executable.to_owned());
            resolve_executable(executable, false)?
        } else if allow_fallback {
            let path = same_stem_executable(dict, bundle, false).ok_or(MISSING_EXECUTABLE)?;
            out.executable_resolution = Some(NAME_FALLBACK);
            path
        } else {
            return Err(MISSING_EXECUTABLE);
        };
        Ok(format!("{bundle}/{relative}"))
    })();
    if let Some(diagnostic) = &mut out.diagnostic {
        diagnostic.plist_value(parsed);
    }
    if let Ok(path) = &resolution {
        out.executable_path = Some(path.clone());
    }
    resolution
}

pub(crate) fn same_stem_executable(dict: &Dictionary, bundle: &str, flat: bool) -> Option<String> {
    if !matches!(string(dict, "CFBundlePackageType"), None | Some("APPL")) {
        return None;
    }
    let (stem, suffix) = bundle.rsplit('/').next()?.rsplit_once('.')?;
    if !suffix.eq_ignore_ascii_case("app") || stem.is_empty() || matches!(stem, "." | "..") {
        return None;
    }
    resolve_executable(stem, flat).ok()
}

// A guessed path earns a main result only after its Mach-O headers verify.
pub(crate) fn confirm_executable(out: &mut ScanResult, primary: Result<()>) -> Result<()> {
    if out.executable_resolution != Some(NAME_FALLBACK) {
        return primary;
    }
    if primary.is_ok()
        && !out.architectures.is_empty()
        && out.architectures.iter().all(|arch| arch.header_verified)
    {
        return Ok(());
    }
    out.executable_resolution = None;
    out.executable_path = None;
    out.executable_size = None;
    out.architectures.clear();
    out.script_runtime = None;
    match primary {
        Ok(())
        | Err(ScanError::NotFound(_))
        | Err(ScanError::Invalid("executable is not Mach-O" | "short executable header"))
        | Err(ScanError::Unsupported(
            "declared executable is a script"
            | "declared executable has DOS/PE magic"
            | "declared executable is ELF",
        )) => Err(MISSING_EXECUTABLE),
        other => other,
    }
}

pub(crate) fn string<'a>(dict: &'a Dictionary, key: &str) -> Option<&'a str> {
    dict.get(key)
        .and_then(Value::as_string)
        .filter(|value| !value.is_empty())
}

pub(crate) fn apply_properties(dict: &Dictionary, bundle: &str, out: &mut ScanResult) {
    let get = |key| string(dict, key);
    out.bundle_path = Some(bundle.to_owned());
    out.bundle_kind = Some(installed_bundle_kind(bundle).unwrap_or("bundle"));
    out.bundle_id = get("CFBundleIdentifier").map(str::to_owned);
    out.version = get("CFBundleShortVersionString")
        .or_else(|| get("CFBundleVersion"))
        .map(str::to_owned);
    out.name = get("CFBundleDisplayName")
        .or_else(|| get("CFBundleName"))
        .map(str::to_owned);
    out.min_macos = get("LSMinimumSystemVersion").map(str::to_owned);
}

pub(crate) fn resolve_executable(executable: &str, flat: bool) -> Result<String> {
    if executable.starts_with('/') || executable.contains(['\\', '\0']) {
        return Err(ScanError::Unsupported(
            "CFBundleExecutable is not bundle-relative",
        ));
    }
    let mut components = if flat {
        vec![]
    } else {
        vec!["Contents", "MacOS"]
    };
    let floor = usize::from(!flat);
    for part in executable.split('/') {
        match part {
            "" | "." => {}
            ".." if components.len() > floor => {
                components.pop();
            }
            ".." => {
                return Err(ScanError::Unsupported(
                    "CFBundleExecutable escapes Contents",
                ));
            }
            part => components.push(part),
        }
    }
    if components.len() <= floor || matches!(executable, "." | "..") || executable.ends_with('/') {
        return Err(ScanError::Invalid("CFBundleExecutable path"));
    }
    Ok(components.join("/"))
}

/// Some publishers record the Contents-relative MacOS/file spelling.
/// Prefer the normal MacOS-relative lookup when both entries exist.
pub(crate) fn contents_relative_alias(path: &str, root: &str) -> Option<String> {
    let relative = path.strip_prefix(root)?.strip_prefix("/Contents/")?;
    let alias = contents_relative_executable(relative)?;
    Some(format!("{root}/Contents/{alias}"))
}

pub(crate) fn contents_relative_executable(relative: &str) -> Option<&str> {
    let path = relative.strip_prefix("MacOS/")?;
    path.starts_with("MacOS/").then_some(path)
}

/// Normalize a reference entirely inside the artifact.
pub(crate) fn normalize_archive_path(path: &str) -> Option<String> {
    if path.starts_with('/') || path.contains(['\\', '\0']) {
        return None;
    }
    let mut components = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => (),
            ".." => {
                components.pop()?;
            }
            _ => components.push(part),
        }
    }
    let value = components.join("/");
    archive_path(&value)?;
    Some(value)
}

pub(crate) fn installed_bundle_kind(path: &str) -> Option<&'static str> {
    let extension = path.rsplit_once('.')?.1;
    if extension.contains('/') {
        return None;
    }
    match extension {
        "app" => Some("app"),
        "vst" | "vst3" | "component" | "aaxplugin" => Some("audio_plugin"),
        "kext" | "dext" | "driver" | "systemextension" => Some("driver"),
        "bundle" if path.contains("SmartCardServices/drivers/") => Some("driver"),
        "jdk" => Some("runtime"),
        _ => None,
    }
}

pub(crate) fn resolve_symlink(path: &str, destination: &str) -> Option<String> {
    if destination.is_empty() || destination.starts_with('/') {
        return None;
    }
    let parent = path.rsplit_once('/').map_or("", |(parent, _)| parent);
    if parent.is_empty() {
        normalize_archive_path(destination)
    } else {
        normalize_archive_path(&format!("{parent}/{destination}"))
    }
}

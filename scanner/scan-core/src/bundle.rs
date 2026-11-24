use crate::{Result, ScanError, ScanResult, Target, plist_value};
use plist::Value;
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

pub(crate) fn apply_plist(bytes: &[u8], bundle: &str, out: &mut ScanResult) -> Result<String> {
    let parsed = plist_value::parse(bytes, ScanError::Invalid("bundle Info.plist"))?;
    let dict = parsed
        .as_dictionary()
        .ok_or(ScanError::Invalid("Info.plist is not a dictionary"))?;
    let get = |key| {
        dict.get(key)
            .and_then(Value::as_string)
            .filter(|s| !s.is_empty())
    };
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
    let executable =
        get("CFBundleExecutable").ok_or(ScanError::NotFound("CFBundleExecutable in Info.plist"))?;
    out.executable_name = Some(executable.to_owned());
    if executable.starts_with('/') || executable.contains(['\\', '\0']) {
        return Err(ScanError::Unsupported(
            "CFBundleExecutable is not bundle-relative",
        ));
    }
    let mut components = vec!["Contents", "MacOS"];
    for part in executable.split('/') {
        match part {
            "" | "." => {}
            ".." if components.len() > 1 => {
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
    if components.len() < 2 || matches!(executable, "." | "..") || executable.ends_with('/') {
        return Err(ScanError::Invalid("CFBundleExecutable path"));
    }
    let path = format!("{bundle}/{}", components.join("/"));
    out.executable_path = Some(path.clone());
    Ok(path)
}

/// Some publishers record the Contents-relative MacOS/file spelling.
/// Prefer the normal MacOS-relative lookup when both entries exist.
pub(crate) fn contents_relative_alias(path: &str, root: &str) -> Option<String> {
    let leaf = path
        .strip_prefix(root)?
        .strip_prefix("/Contents/MacOS/MacOS/")?;
    Some(format!("{root}/Contents/MacOS/{leaf}"))
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

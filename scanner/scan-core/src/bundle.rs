use crate::{Result, ScanError, ScanResult, plist_value};
use plist::Value;

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
    if matches!(executable, "." | "..") || executable.contains(['/', '\\', '\0']) {
        return Err(ScanError::Unsupported(
            "CFBundleExecutable is not a single filename",
        ));
    }
    Ok(format!("{bundle}/Contents/MacOS/{executable}"))
}

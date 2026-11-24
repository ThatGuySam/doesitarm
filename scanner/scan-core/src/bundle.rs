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
    !root.trim_end_matches(".app").contains(".app/")
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
    apply_properties(dict, bundle, out);
    let executable = string(dict, "CFBundleExecutable")
        .ok_or(ScanError::NotFound("CFBundleExecutable in Info.plist"))?;
    out.executable_name = Some(executable.to_owned());
    let relative = resolve_executable(executable, false)?;
    Ok(format!("{bundle}/{relative}"))
}

pub(crate) fn string<'a>(dict: &'a Dictionary, key: &str) -> Option<&'a str> {
    dict.get(key)
        .and_then(Value::as_string)
        .filter(|value| !value.is_empty())
}

pub(crate) fn apply_properties(dict: &Dictionary, bundle: &str, out: &mut ScanResult) {
    let get = |key| string(dict, key);
    out.bundle_path = Some(bundle.to_owned());
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

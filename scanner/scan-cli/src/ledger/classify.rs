use super::store::{Record, success};
use regex::Regex;
use serde_json::Value;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

static HTTP_STATUS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\bhttp (\d{3})\b").unwrap());

pub(super) fn http_status(error: &str) -> Option<u16> {
    HTTP_STATUS.captures(error)?[1].parse().ok()
}

pub(super) fn category(scan: &Value, target: Option<&Value>, app: &Value) -> &'static str {
    let error = scan["error"].as_str().unwrap_or_default().to_lowercase();
    let status = scan["status"].as_str().unwrap_or_default();
    let verified = |slices: &Value| {
        slices.as_array().is_some_and(|items| {
            !items.is_empty() && items.iter().all(|slice| slice["header_verified"] == true)
        })
    };
    if status == "complete" {
        if target.is_some_and(|x| x["kind"] == "executable") || scan["format"] == "macho" {
            return if !verified(&scan["architectures"]) {
                "executable_not_found"
            } else if scan["min_macos"].is_null() {
                "metadata_missing"
            } else {
                "verified_executable"
            };
        }
        let declared = app["declared_apps"].as_array();
        if target.is_none() && declared.is_some_and(|apps| apps.len() > 1) {
            return "multi_app";
        }
        let wanted = target.and_then(|v| v["path"].as_str()).or_else(|| {
            declared
                .and_then(|apps| apps.first())
                .and_then(Value::as_str)
        });
        let path_parts = |path: &str| -> Vec<String> {
            path.trim_start_matches("./")
                .rsplit('/')
                .map(|p| p.nfc().flat_map(char::to_lowercase).collect::<String>())
                .collect()
        };
        if wanted.is_some_and(|path| {
            !path_parts(scan["bundle_path"].as_str().unwrap_or_default())
                .starts_with(&path_parts(path))
        }) || !verified(&scan["architectures"])
        {
            return "executable_not_found";
        }
        if ["bundle_id", "version", "min_macos"]
            .into_iter()
            .any(|field| scan[field].is_null())
        {
            return "metadata_missing";
        }
        return if scan["bundle_kind"]
            .as_str()
            .is_none_or(|kind| kind == "app")
        {
            "verified"
        } else {
            "verified_plugin"
        };
    }
    if status == "budget_exhausted" {
        return "budget_hit";
    }
    if error.contains("http 200") && error.contains("expected 206") {
        return "host_200_to_range";
    }
    match http_status(&error) {
        Some(401) => return "http_401",
        Some(403) => return "http_403",
        Some(404) => return "http_404",
        Some(410) => return "http_410",
        Some(429) => return "http_429",
        _ => {}
    }
    if status == "timeout" {
        return "timeout";
    }
    if status == "source_error" {
        return "other_source_error";
    }
    if error.contains("installer distribution references remote") {
        return "installer_remote_components";
    }
    if scan["source_content_type"].as_str().is_some_and(|mime| {
        mime.split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .eq_ignore_ascii_case("text/html")
    }) && scan["format"].is_null()
    {
        return "html_response";
    }
    if error.contains("multi-app") {
        return "multi_app";
    }
    if error.contains("encrypted or sealed") {
        return "encrypted_or_sealed";
    }
    if error.contains("encrypted") || error.contains("password") {
        return "encrypted";
    }
    if error.contains("nested")
        || scan["nested_artifacts"]
            .as_array()
            .is_some_and(|a| !a.is_empty())
    {
        return "nested_container";
    }
    if error.contains("declared executable is a script") {
        return if verified(&scan["script_runtime"]["architectures"]) {
            "script_runtime_verified"
        } else {
            "script_executable"
        };
    }
    if [
        "executable is not mach-o",
        "executable is elf",
        "dos/pe magic",
    ]
    .iter()
    .any(|detail| error.contains(detail))
    {
        return "non_macho_executable";
    }
    if error.contains("executable") && (error.contains("symlink") || error.contains(" is a link")) {
        return "linked_executable";
    }
    if status == "unsupported" {
        return if ["codec", "compression", "compressed", "zip method"]
            .iter()
            .any(|detail| error.contains(detail))
        {
            "unsupported_codec"
        } else {
            "unsupported_container"
        };
    }
    if status == "not_found" {
        if error.contains("executable") || error.contains("mach-o") {
            return "executable_not_found";
        }
        if error.contains("app") || error.contains("info.plist") {
            return "plist_not_found";
        }
    }
    if status == "invalid" {
        "invalid_container"
    } else {
        "other"
    }
}

fn architectures(record: &Record) -> Vec<&str> {
    let mut names: Vec<_> = record
        .result
        .as_ref()
        .and_then(|v| v["architectures"].as_array())
        .into_iter()
        .flatten()
        .filter_map(|a| {
            if a.is_string() {
                a.as_str()
            } else if a["header_verified"] == true {
                a["name"].as_str()
            } else {
                None
            }
        })
        .collect();
    names.sort_unstable();
    names.dedup();
    names
}

pub(super) fn compare(before: &Record, after: &Record) -> &'static str {
    match (success(&before.status), success(&after.status)) {
        (false, true) => "fixed",
        (true, false) => "regressed",
        (true, true) => {
            let old = architectures(before);
            let new = architectures(after);
            if old.iter().any(|arch| !new.contains(arch)) {
                "regressed"
            } else if new.iter().any(|arch| !old.contains(arch)) {
                "fixed"
            } else {
                "same"
            }
        }
        (false, false) if before.failure_class != after.failure_class => "changed_failure",
        (false, false) => "same",
    }
}

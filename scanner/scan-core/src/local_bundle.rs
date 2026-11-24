use crate::{ScanError, ScanResult, Status, bundle, diagnostic::plist_encoding, plist_value};
use plist::Value;
use serde::{
    Serialize, Serializer,
    ser::{SerializeMap, SerializeSeq},
};
use std::fmt::Write;

#[derive(Serialize)]
pub struct LocalBundleMetadata {
    pub result: ScanResult,
    pub bundle_role: &'static str,
    pub error_class: Option<&'static str>,
    pub executable_relative_path: Option<String>,
    pub executable_resolution: Option<&'static str>,
    pub info_plist_encoding: &'static str,
    pub info_plist_keys: Vec<String>,
    #[serde(serialize_with = "serialize_plist")]
    pub info_plist: Option<Value>,
}

pub fn local_bundle_metadata(
    bytes: &[u8],
    bundle_path: &str,
    plist_path: &str,
    nested: bool,
    role_hint: &str,
) -> LocalBundleMetadata {
    let mut metadata = LocalBundleMetadata {
        result: ScanResult::new(bytes.len() as u64),
        bundle_role: if role_hint == "wrapper" {
            "wrapper"
        } else if nested {
            "nested_app"
        } else {
            "app"
        },
        error_class: None,
        executable_relative_path: None,
        executable_resolution: None,
        info_plist_encoding: plist_encoding(bytes),
        info_plist_keys: Vec::new(),
        info_plist: None,
    };
    let result = &mut metadata.result;
    result.format = Some("app");
    result.bundle_path = Some(bundle_path.into());
    if result.total_size > bundle::MAX_PLIST {
        result.set_error(ScanError::Limit("bundle Info.plist size"));
        metadata.error_class = Some("plist_size_limit");
        return metadata;
    }
    result.bytes_read = result.total_size;
    result.bytes_requested = result.total_size;
    result.reads = 1;

    let raw = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let value = plist_value::parse(raw, ScanError::Invalid("bundle Info.plist"));
    let value = match value {
        Ok(value) => value,
        Err(error) => {
            result.set_error(error);
            metadata.error_class = Some("invalid_info_plist");
            return metadata;
        }
    };
    let Some(dict) = value.as_dictionary() else {
        result.set_error(ScanError::Invalid("Info.plist is not a dictionary"));
        metadata.error_class = Some("invalid_info_plist");
        metadata.info_plist = Some(value);
        return metadata;
    };
    bundle::apply_properties(dict, bundle_path, result);
    metadata.info_plist_keys = dict.keys().cloned().collect();

    if let Some(executable) = bundle::string(dict, "CFBundleExecutable") {
        result.executable_name = Some(executable.into());
        match bundle::resolve_executable(executable, plist_path == "Info.plist") {
            Ok(relative) => {
                result.executable_path = Some(format!("{bundle_path}/{relative}"));
                metadata.executable_relative_path = Some(relative);
                metadata.executable_resolution = Some("declared");
            }
            Err(error) => {
                result.set_error(error);
                metadata.error_class = Some("invalid_executable_path");
            }
        }
    } else {
        result.status = Status::NoExecutable;
        let (class, reason) = match role_hint {
            "wrapper" => {
                metadata.bundle_role = "wrapper";
                (
                    "wrapper_bundle",
                    "This wrapper has a nested app and declares no executable of its own.",
                )
            }
            "resource_only" if bundle::string(dict, "CFBundlePackageType") == Some("BNDL") => {
                metadata.bundle_role = "resource_only";
                (
                    "resource_only_bundle",
                    "This resource bundle declares no executable.",
                )
            }
            _ => (
                "missing_executable_key",
                "Info.plist has no nonempty CFBundleExecutable.",
            ),
        };
        let package = bundle::string(dict, "CFBundlePackageType");
        if class == "missing_executable_key" && matches!(package, None | Some("APPL")) {
            // Finder/app code identity can use the bundle stem. This is only
            // an exact path candidate. The host still has to verify its bytes.
            let leaf = bundle_path.rsplit('/').next().unwrap_or_default();
            if let Some((stem, suffix)) = leaf.rsplit_once('.')
                && suffix.eq_ignore_ascii_case("app")
                && !stem.is_empty()
                && !stem.contains(['/', '\\', '\0'])
                && !matches!(stem, "." | "..")
            {
                let relative = if plist_path == "Info.plist" {
                    stem.to_owned()
                } else {
                    format!("Contents/MacOS/{stem}")
                };
                metadata.executable_relative_path = Some(relative);
                metadata.executable_resolution = Some("bundle_name_fallback");
            }
        }
        metadata.error_class = Some(class);
        result.error = Some(reason.into());
    }
    metadata.info_plist = Some(value);
    metadata
}

pub(crate) fn serialize_plist<S: Serializer>(
    value: &Option<Value>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    match value {
        Some(value) => PlistJson(value).serialize(serializer),
        None => serializer.serialize_none(),
    }
}

struct PlistJson<'a>(&'a Value);

impl Serialize for PlistJson<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        fn tagged<S: Serializer>(
            serializer: S,
            kind: &str,
            value: &str,
        ) -> Result<S::Ok, S::Error> {
            let mut entry = serializer.serialize_map(Some(2))?;
            entry.serialize_entry("$plist", kind)?;
            entry.serialize_entry("value", value)?;
            entry.end()
        }

        const MAX_SAFE: u64 = (1 << 53) - 1;
        match self.0 {
            Value::Array(values) => {
                let mut items = serializer.serialize_seq(Some(values.len()))?;
                for value in values {
                    items.serialize_element(&PlistJson(value))?;
                }
                items.end()
            }
            Value::Dictionary(values) => {
                let mut entries = serializer.serialize_map(Some(values.len()))?;
                for (key, value) in values {
                    entries.serialize_entry(key, &PlistJson(value))?;
                }
                entries.end()
            }
            Value::Boolean(value) => serializer.serialize_bool(*value),
            Value::String(value) => serializer.serialize_str(value),
            Value::Real(value) if value.is_finite() => serializer.serialize_f64(*value),
            Value::Real(value) => tagged(serializer, "real", &value.to_string()),
            Value::Integer(value) => {
                if let Some(value) = value.as_signed().filter(|v| v.unsigned_abs() <= MAX_SAFE) {
                    serializer.serialize_i64(value)
                } else if let Some(value) = value.as_unsigned().filter(|v| *v <= MAX_SAFE) {
                    serializer.serialize_u64(value)
                } else {
                    tagged(serializer, "integer", &value.to_string())
                }
            }
            Value::Date(value) => tagged(serializer, "date", &value.to_xml_format()),
            Value::Uid(value) => tagged(serializer, "uid", &value.get().to_string()),
            Value::Data(value) => {
                let mut hex = String::with_capacity(value.len() * 2);
                for byte in value {
                    let _ = write!(hex, "{byte:02x}");
                }
                tagged(serializer, "data_hex", &hex)
            }
            _ => Err(serde::ser::Error::custom("unsupported property list value")),
        }
    }
}

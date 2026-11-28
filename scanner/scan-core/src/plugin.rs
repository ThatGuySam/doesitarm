use crate::{Result, ScanError, bundle};
use plist::{Dictionary, Value};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct AudioComponent {
    name: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    subtype: Option<String>,
    manufacturer: Option<String>,
    version: Option<u32>,
}

impl AudioComponent {
    pub(crate) fn from_plist(dict: &Dictionary) -> Vec<Self> {
        dict.get("AudioComponents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_dictionary)
            .map(|entry| {
                let code = |key| {
                    bundle::string(entry, key)
                        .filter(|value| value.len() == 4 && value.is_ascii())
                        .map(str::to_owned)
                };
                Self {
                    name: bundle::string(entry, "name").map(str::to_owned),
                    kind: code("type"),
                    subtype: code("subtype"),
                    manufacturer: code("manufacturer"),
                    version: entry
                        .get("version")
                        .and_then(Value::as_unsigned_integer)
                        .and_then(|version| u32::try_from(version).ok()),
                }
            })
            .collect()
    }
}

#[derive(Deserialize, Serialize)]
pub struct Vst3ModuleInfo {
    #[serde(rename(deserialize = "Name"))]
    name: Option<String>,
    #[serde(rename(deserialize = "Version"))]
    version: Option<String>,
    #[serde(default, rename(deserialize = "Classes"))]
    classes: Vec<Vst3Class>,
    #[serde(default, rename(deserialize = "Compatibility"))]
    compatibility: Vec<Vst3Compatibility>,
}

#[derive(Deserialize, Serialize)]
struct Vst3Class {
    #[serde(rename(deserialize = "CID"))]
    id: String,
    #[serde(rename(deserialize = "Name"))]
    name: Option<String>,
    #[serde(rename(deserialize = "Category"))]
    category: Option<String>,
    #[serde(rename(deserialize = "Version"))]
    version: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct Vst3Compatibility {
    #[serde(rename(deserialize = "New"))]
    new: String,
    #[serde(rename(deserialize = "Old"))]
    old: Vec<String>,
}

pub fn vst3_module_info(bytes: &[u8]) -> Result<Vst3ModuleInfo> {
    if bytes.len() as u64 > bundle::MAX_PLIST {
        return Err(ScanError::Limit("VST3 moduleinfo size"));
    }
    let invalid = |_| ScanError::Invalid("VST3 moduleinfo.json");
    let text = std::str::from_utf8(bytes).map_err(invalid)?;
    check_json5_depth(text)?;
    json5::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| ScanError::Invalid("VST3 moduleinfo.json"))
}

// The JSON5 decoder recursively skips unknown fields. Bound that traversal
// before deserializing, ignoring punctuation in strings and comments.
fn check_json5_depth(text: &str) -> Result<()> {
    let mut chars = text.chars().peekable();
    let mut depth = 0u8;
    while let Some(ch) = chars.next() {
        match ch {
            '"' | '\'' => {
                while let Some(next) = chars.next() {
                    if next == ch {
                        break;
                    }
                    if next == '\\' {
                        chars.next();
                    }
                }
            }
            '/' if chars.next_if_eq(&'/').is_some() => {
                while chars
                    .next_if(|c| !matches!(c, '\r' | '\n' | '\u{2028}' | '\u{2029}'))
                    .is_some()
                {}
            }
            '/' if chars.next_if_eq(&'*').is_some() => {
                while let Some(next) = chars.next() {
                    if next == '*' && chars.next_if_eq(&'/').is_some() {
                        break;
                    }
                }
            }
            '[' | '{' => {
                depth += 1;
                if depth > 64 {
                    return Err(ScanError::Limit(
                        "VST3 moduleinfo nesting exceeds 64 collections",
                    ));
                }
            }
            ']' | '}' => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Status, local_bundle_metadata};

    #[test]
    fn local_audio_components_use_declared_code_and_keep_individual_identities() {
        let plist = br#"<plist><dict>
            <key>CFBundleDisplayName</key><string>Example</string>
            <key>CFBundleExecutable</key><string>Declared</string>
            <key>CFBundleIdentifier</key><string>org.example.au</string>
            <key>CFBundleVersion</key><string>25</string>
            <key>AudioComponents</key><array>
                <dict><key>name</key><string>Test: Instrument</string><key>type</key><string>aumu</string>
                  <key>subtype</key><string>inst</string><key>manufacturer</key><string>Test</string>
                  <key>version</key><integer>65539</integer></dict>
                <dict><key>type</key><string>aufx</string><key>subtype</key><string>effect</string></dict>
            </array>
        </dict></plist>"#;
        let au = local_bundle_metadata(
            plist,
            "Components/Example.COMPONENT",
            "Contents/Info.plist",
            true,
            "wrapper",
        );
        assert_eq!(au.result.format, Some("au"));
        assert_eq!(au.bundle_role, "audio_plugin");
        assert_eq!(
            au.executable_relative_path.as_deref(),
            Some("Contents/MacOS/Declared")
        );
        assert_eq!(au.result.name.as_deref(), Some("Example"));
        assert_eq!(au.result.bundle_id.as_deref(), Some("org.example.au"));
        assert_eq!(au.result.version.as_deref(), Some("25"));
        assert!(au.info_plist.is_none());
        assert_eq!(au.audio_components.len(), 2);
        assert_eq!(au.audio_components[0].manufacturer.as_deref(), Some("Test"));
        assert_eq!(au.audio_components[0].version, Some(65539));
        assert_eq!(au.audio_components[1].subtype, None);
    }

    #[test]
    fn plugin_metadata_does_not_inherit_app_launcher_rules() {
        for (path, format) in [
            ("P.component", "au"),
            ("P.VST", "vst2"),
            ("P.vst3", "vst3"),
            ("P.clap", "clap"),
            ("P.aaxplugin", "aax"),
        ] {
            let metadata = local_bundle_metadata(
                b"<plist><dict/></plist>",
                path,
                "Info.plist",
                false,
                "wrapper",
            );
            assert_eq!(metadata.result.format, Some(format));
            assert_eq!(metadata.error_class, Some("missing_executable_key"));
            assert!(matches!(metadata.result.status, Status::NoExecutable));
            assert_eq!(metadata.executable_relative_path, None);
        }
        let plist =
            b"<plist><dict><key>CFBundleExecutable</key><string>../Helper</string></dict></plist>";
        let bad = local_bundle_metadata(plist, "P.clap", "Contents/Info.plist", false, "");
        assert_eq!(bad.error_class, Some("invalid_executable_path"));
        let app =
            local_bundle_metadata(b"<plist><dict/></plist>", "P.app", "Info.plist", false, "");
        assert_eq!(app.executable_relative_path.as_deref(), Some("P"));
    }

    #[test]
    fn vst3_moduleinfo_accepts_json5_and_bounds_ignored_content() {
        let info = vst3_module_info(
            br#"{
          // The snapshot path is outside the class fields we need.
          Name: 'Example',
          Version: "1.0",
          Classes: [{CID: "AABB", Name: 'Synth {[', Snapshots: [{}],}],
          Compatibility: [{New: 'AABB', Old: ['1122']}],
        }"#,
        )
        .unwrap();
        assert_eq!(info.name.as_deref(), Some("Example"));
        assert_eq!(info.version.as_deref(), Some("1.0"));
        assert_eq!(info.classes[0].id, "AABB");
        assert_eq!(info.compatibility[0].old, ["1122"]);
        let deep = format!("{{other: {}0{}}}", "[".repeat(64), "]".repeat(64));
        assert!(matches!(
            vst3_module_info(deep.as_bytes()),
            Err(ScanError::Limit(_))
        ));
        assert!(matches!(
            vst3_module_info(b"{bad"),
            Err(ScanError::Invalid(_))
        ));
    }
}

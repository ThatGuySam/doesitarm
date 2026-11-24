use super::{
    Result,
    capture::{self, Capture, HttpEvidence, KIT_BYTES, Phase},
    classify, import, live, privacy,
    store::{Record, Settings, Store, success},
};
use crate::Output;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{fs, path::Path};

const README: &str = "# Offline scanner replay\n\n\
This kit includes a ledger record, the recorded byte spans in `ranges.bin`, and their original artifact offsets in `replay.json`. A zero-length payload is valid for an HTTP rejection before any artifact bytes were read. `ledger replay` runs the scanner against these sparse spans. It fails explicitly if the parser requests uncaptured bytes.\n\n\
Run `scan-cli ledger replay .` here to inspect the new result. Run `SCAN_CLI=/absolute/path/to/scan-cli cargo test --offline` to assert the recorded failure class. For a fix, reproduce the failure first and update the test to assert the intended result. The scanner is the only external requirement.\n";

const CARGO: &str = "[package]\nname = \"scanner-replay-kit\"\nversion = \"0.1.0\"\nedition = \"2024\"\n\n[workspace]\n";

const TEST: &str = r#"#[test]
fn reproduces_recorded_failure_class() {
    let binary = std::env::var_os("SCAN_CLI").expect("Set SCAN_CLI to the absolute path to scan-cli");
    let output = std::process::Command::new(binary)
        .args(["ledger", "replay", env!("CARGO_MANIFEST_DIR")])
        .output()
        .expect("Run offline scanner");
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let stdout = String::from_utf8(output.stdout).unwrap();
    let actual = stdout.lines().next().unwrap_or_default();
    assert_eq!(actual, include_str!("../failure-class.txt").trim());
}
"#;

#[derive(Deserialize, Serialize)]
struct Kit {
    version: u8,
    artifact: Value,
    settings: Settings,
    expected_class: String,
    probe: Option<HttpEvidence>,
    phases: Vec<Phase>,
    payload_sha256: String,
}

impl Kit {
    fn create(record: &Record, capture: &Capture) -> Result<Self> {
        if capture.over_limit || capture.phases.iter().any(|p| p.log_overflow > 0) {
            return Err("Read evidence exceeds the 2 MB kit limit. Capture a smaller failing tier or fixture".into());
        }
        if !privacy::safe_binary(&capture.payload) {
            return Err(
                "Capture contains a private path or credential and cannot be stored verbatim"
                    .into(),
            );
        }
        if capture.phases.is_empty() && capture.probe.is_none() {
            return Err("No parser input or HTTP response was captured".into());
        }
        // Check each original span as well as their concatenation. A read can
        // start on a different alignment from the concatenated file.
        for phase in &capture.phases {
            for span in &phase.read_log {
                if let Some(offset) = span.payload_offset
                    && !privacy::safe_binary(&capture.payload[offset..offset + span.length])
                {
                    return Err("A range contains a private path or credential".into());
                }
            }
        }
        let artifact = record.evidence["artifact"].clone();
        let mut bytes = serde_json::to_value(Self {
            version: 1,
            artifact,
            settings: record.settings.clone(),
            expected_class: record
                .failure_class
                .clone()
                .ok_or("Attempt has no failure class")?,
            probe: capture.probe.clone(),
            phases: capture.phases.clone(),
            payload_sha256: privacy::sha(&capture.payload),
        })?;
        privacy::value(&mut bytes);
        Ok(serde_json::from_value(bytes)?)
    }

    fn replay(&self, payload: &[u8]) -> Result<(String, Value)> {
        if self.version != 1 || self.payload_sha256 != privacy::sha(payload) {
            return Err("Kit version or range payload hash does not match".into());
        }
        let limits = live::limits(&self.settings)?;
        let target = live::target(&self.settings);
        let mut prior = None::<Output>;
        for phase in &self.phases {
            if phase.transport == "stream"
                && let Some(previous) = &prior
                && !matches!(previous.scan.status, scan_core::Status::SourceError)
            {
                break;
            }
            let mut output = capture::replay_phase(phase, payload, limits, target)?;
            if let Some(previous) = &prior {
                output.scan.bytes_requested += previous.scan.bytes_requested;
                output.scan.reads += previous.scan.reads;
            }
            prior = Some(output);
        }
        let output = match prior {
            Some(output) => output,
            None => {
                capture::probe_replay(self.probe.as_ref().ok_or("Kit contains no HTTP response")?)?
            }
        };
        let result = serde_json::to_value(output)?;
        let class = classify::category(&result, self.settings.target.as_ref(), &self.artifact);
        Ok((class.into(), result))
    }
}

fn publish(
    kit: &Kit,
    record: &Record,
    requested: &Record,
    payload: &[u8],
    out: &Path,
) -> Result<()> {
    let cwd = out
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    fs::create_dir_all(cwd)?;
    if out.exists() {
        return Err("Kit destination already exists".into());
    }
    let tmp = tempfile::tempdir_in(cwd)?;
    let dir = tmp.path();
    fs::create_dir_all(dir.join("tests"))?;
    for (name, value) in [
        ("replay.json", serde_json::to_vec(kit)?),
        ("record.json", serde_json::to_vec_pretty(requested)?),
        ("captured.json", serde_json::to_vec_pretty(record)?),
        ("ranges.bin", payload.to_vec()),
        ("README.md", README.as_bytes().to_vec()),
        ("Cargo.toml", CARGO.as_bytes().to_vec()),
        ("tests/replay.rs", TEST.as_bytes().to_vec()),
        (
            "failure-class.txt",
            format!("{}\n", kit.expected_class).into_bytes(),
        ),
    ] {
        fs::write(dir.join(name), value)?;
    }
    let size = super::store::used(dir)?;
    if size >= 2_000_000 {
        return Err(format!("Kit requires {size} bytes. Limit is 2 MB").into());
    }
    fs::rename(dir, out)?;
    println!("{} {} {} bytes", requested.token, kit.expected_class, size);
    Ok(())
}

pub(super) fn create(root: &Path, id: &str, out: &Path, input: Option<&Path>) -> Result<()> {
    let rows = Store::open(root.to_path_buf())?.records()?;
    let requested = rows
        .iter()
        .find(|row| row.ledger_id == id)
        .ok_or("Unknown ledger ID")?;
    if requested.failure_class.is_none() || success(&requested.status) {
        return Err("Kit requires a recorded failure".into());
    }
    let (record, capture) = if let Some(input) = input {
        let mut settings = requested.settings.clone();
        settings.profile = Some("local".into());
        let (output, capture, elapsed) = capture::local(
            input,
            live::limits(&settings)?,
            live::target(&settings),
            None,
        )?;
        let entry = live::entry_for(requested);
        let mut row =
            import::live_record(&entry, settings, &serde_json::to_value(output)?, elapsed);
        live::enrich(&mut row, &capture)?;
        row.evidence = json!({"artifact":entry, "capture_source":"supplied_local_file"});
        row.previous_id = Some(requested.ledger_id.clone());
        row.change = Some(classify::compare(requested, &row).into());
        row.provenance = requested.provenance.clone();
        (
            row.seal(&format!("local-kit:{}", requested.ledger_id))?,
            capture,
        )
    } else {
        if requested.settings.profile.as_deref() == Some("local") {
            return Err(
                "This record uses the local profile. Supply its archive with --input FILE".into(),
            );
        }
        live::rerun_record(requested, true)?
    };
    let store = Store::open(root.to_path_buf())?;
    store.append(&record)?;
    if record.failure_class != requested.failure_class {
        return Err(format!(
            "Live outcome changed from {} to {}. Capture recorded as {}",
            requested.failure_class.as_deref().unwrap_or_default(),
            record.status,
            record.ledger_id
        )
        .into());
    }
    if let (Some(old), Some(new)) = (requested.artifact_size, record.artifact_size)
        && old != new
    {
        return Err("Live artifact size differs from the historical attempt".into());
    }
    if let (Some(old), Some(new)) = (requested.headers.get("etag"), record.headers.get("etag"))
        && old != new
    {
        return Err("Live ETag differs from the historical attempt".into());
    }
    let kit = Kit::create(&record, &capture)?;
    let (class, offline) = kit.replay(&capture.payload)?;
    let current = record.result.as_ref().unwrap();
    if class != kit.expected_class
        || offline["status"] != current["status"]
        || offline["error"] != current["error"]
    {
        return Err(format!(
            "Offline replay differed. Expected {} ({:?}), got {class} ({:?})",
            kit.expected_class, current["error"], offline["error"]
        )
        .into());
    }
    if out.starts_with(root) {
        store.reserve(2_000_000, 0)?;
    }
    publish(&kit, &record, requested, &capture.payload, out)?;
    store.update_latest(&store.records()?)?;
    Ok(())
}

pub(super) fn inspect(dir: &Path) -> Result<()> {
    let metadata = dir.join("replay.json");
    let ranges = dir.join("ranges.bin");
    if ranges.metadata()?.len() > KIT_BYTES as u64
        || ranges.metadata()?.len() + metadata.metadata()?.len() >= 2_000_000
    {
        return Err("Kit exceeds the 2 MB replay limit".into());
    }
    let kit: Kit = serde_json::from_slice(&fs::read(metadata)?)?;
    let payload = fs::read(ranges)?;
    let (class, mut result) = kit.replay(&payload)?;
    privacy::value(&mut result);
    println!("{class}");
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "expected_class":kit.expected_class, "failure_class":class, "scan":result,
        }))?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ledger::capture::local;
    use scan_core::{Profile, ScanLimits, Target};
    use std::fs;

    #[test]
    fn sparse_read_replay_uses_artifact_bytes_and_detects_missing_coverage() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), b"This is not an archive").unwrap();
        let limits = ScanLimits::for_profile(Profile::Local);
        let (output, capture, _) = local(file.path(), limits, Target::Auto, None).unwrap();
        let scan = serde_json::to_value(output).unwrap();
        let record = Record {
            failure_class: Some("unsupported_container".into()),
            settings: Settings {
                profile: Some("local".into()),
                ..Settings::default()
            },
            ..Record::default()
        };
        let mut kit = Kit::create(&record, &capture).unwrap();
        let (class, offline) = kit.replay(&capture.payload).unwrap();
        assert_eq!(class, record.failure_class.unwrap());
        assert_eq!(offline, scan);

        kit.phases[0].read_log.clear();
        assert!(
            kit.replay(&capture.payload)
                .unwrap_err()
                .to_string()
                .contains("lacks coverage")
        );
    }

    #[test]
    fn recorded_http_status_runs_range_validation() {
        let probe = HttpEvidence {
            status: 404,
            final_url: "https://example.invalid/gone".into(),
            ..HttpEvidence::default()
        };
        let result = capture::probe_replay(&probe).unwrap();
        let scan = serde_json::to_value(result).unwrap();
        assert_eq!(classify::category(&scan, None, &Value::Null), "http_404");
        assert_eq!(
            scan["error"],
            "source: range 0-0: HTTP 404 Not Found (expected 206)"
        );
    }
}

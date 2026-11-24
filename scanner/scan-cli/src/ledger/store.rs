use super::{Result, privacy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    fs::{self, File},
    io::{BufRead, BufReader, BufWriter, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

pub(super) const CAP: u64 = 49_000_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct Origin {
    pub imported_from: String,
    pub original_line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locator: Option<String>,
    pub original_sha256: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub(super) struct Settings {
    pub profile: Option<String>,
    pub tier_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub flags: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub(super) struct Record {
    pub schema_version: u8,
    pub ledger_id: String,
    pub name: String,
    pub token: String,
    pub source: String,
    pub original_url: Option<String>,
    pub final_url: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub redirect_chain: Vec<String>,
    pub url_redacted: bool,
    pub redacted: bool,
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    pub artifact_size: Option<u64>,
    pub container_format: Option<String>,
    pub scanner_commit: Option<String>,
    pub scanned_at: Option<String>,
    pub time_bucket: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub stage_order: u32,
    pub settings: Settings,
    pub result: Option<Value>,
    pub status: String,
    pub failure_class: Option<String>,
    pub error: Option<String>,
    pub bytes_read: Option<u64>,
    pub bytes_requested: Option<u64>,
    pub reads: Option<u64>,
    pub elapsed_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_512_hex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container_summary: Option<Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub read_log: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info_plist_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_executable_header_sha256: Option<String>,
    pub repro: Option<String>,
    pub provenance: Vec<Origin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub campaign_entry: Option<usize>,
    #[serde(skip_serializing_if = "is_false")]
    pub campaign_final: bool,
    #[serde(skip_serializing_if = "Value::is_null")]
    pub evidence: Value,
}

fn is_zero(value: &u32) -> bool {
    *value == 0
}

fn is_false(value: &bool) -> bool {
    !value
}

pub(super) fn string(value: &Value, key: &str) -> Option<String> {
    value[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

pub(super) fn when(value: Option<&str>) -> i128 {
    value
        .and_then(|date| OffsetDateTime::parse(date, &Rfc3339).ok())
        .map_or(i128::MIN, |date| date.unix_timestamp_nanos())
}

pub(super) fn now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap()
}

pub(super) fn success(class: &str) -> bool {
    matches!(
        class,
        "complete"
            | "verified"
            | "verified_app"
            | "verified_executable"
            | "verified_plugin"
            | "script_runtime_verified"
    )
}

impl Record {
    pub fn seal(mut self, discriminator: &str) -> Result<Self> {
        self.schema_version = 1;
        self.time_bucket = format!("{}:{discriminator}", when(self.scanned_at.as_deref()));
        self.url_redacted = self
            .original_url
            .as_deref()
            .is_some_and(|url| privacy::text(url) != url)
            || self
                .final_url
                .as_deref()
                .is_some_and(|url| privacy::text(url) != url)
            || self
                .redirect_chain
                .iter()
                .any(|url| privacy::text(url) != *url);
        self.first_512_hex = self.first_512_hex.take().and_then(|hex| {
            let bytes = privacy::unhex(&hex)?;
            let bytes = &bytes[..bytes.len().min(512)];
            privacy::safe_binary(bytes).then(|| privacy::hex(bytes))
        });
        self.repro = self.command();
        let mut row = serde_json::to_value(&self)?;
        privacy::value(&mut row);
        let mut safe: Self = serde_json::from_value(row)?;
        safe.redacted =
            safe.url_redacted || serde_json::to_value(&safe)? != serde_json::to_value(&self)?;
        safe.ledger_id = privacy::sha(serde_json::to_vec(&(
            &safe.source,
            &safe.original_url,
            &safe.scanner_commit,
            &safe.time_bucket,
        ))?);
        Ok(safe)
    }

    pub fn command(&self) -> Option<String> {
        let quote = |s: &str| format!("'{}'", s.replace('\'', "'\"'\"'"));
        let input = if self.settings.profile.as_deref() == Some("local") {
            "\"$ARTIFACT\"".to_owned()
        } else {
            let input = self.original_url.as_ref()?;
            if (!self.rerunnable() && self.failure_class.as_deref() != Some("cli_options_rejected"))
                || privacy::text(input) != *input
            {
                return None;
            }
            quote(input)
        };
        let mut argv = Vec::new();
        if let Some(timeout) = self.settings.timeout_ms {
            argv.extend([
                "timeout".into(),
                format!("{}.{:03}s", timeout / 1000, timeout % 1000),
            ]);
        }
        argv.extend(["scan-cli".to_owned(), "scan".into(), input, "--json".into()]);
        if let Some(profile) = &self.settings.profile {
            argv.extend(["--profile".into(), quote(profile)]);
        }
        if let Some(tier) = self.settings.tier_bytes {
            argv.extend(["--budget".into(), tier.to_string()]);
        }
        if let Some(deadline) = self.settings.deadline_ms {
            argv.extend(["--deadline-ms".into(), deadline.to_string()]);
        }
        argv.extend(self.settings.flags.iter().map(|flag| quote(flag)));
        if let Some(target) = &self.settings.target
            && let Some(path) = target["path"].as_str()
        {
            argv.push(
                if target["kind"] == "bundle" {
                    "--bundle-path"
                } else {
                    "--binary-path"
                }
                .into(),
            );
            argv.push(quote(path));
        }
        Some(argv.join(" "))
    }

    pub fn rerunnable(&self) -> bool {
        self.original_url.as_deref().is_some_and(|url| {
            (url.starts_with("https://") || url.starts_with("http://"))
                && !url.contains("sha256-")
                && !url.contains("<user>")
                && !url.to_ascii_lowercase().contains("%3cuser%3e")
                && !url.contains("[redacted]")
        }) && !matches!(
            self.failure_class.as_deref(),
            Some(
                "robots_disallowed"
                    | "catalog_requires_post"
                    | "license_required"
                    | "payment_required"
                    | "authentication_required"
                    | "cli_options_rejected"
                    | "http_401"
            )
        ) && self.evidence["stage"] != "discover"
    }

    pub fn order(&self) -> (i128, bool, u32, &str) {
        (
            when(self.scanned_at.as_deref()),
            self.previous_id.is_some() || self.campaign_entry.is_some(),
            self.stage_order,
            &self.ledger_id,
        )
    }
}

pub(super) struct Store {
    root: PathBuf,
    _lock: File,
}

impl Store {
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let file = File::options()
            .create(true)
            .truncate(false)
            .write(true)
            .open(root.join(".lock"))?;
        file.lock()?;
        repair_tail(&root.join("attempts.jsonl"))?;
        Ok(Self { root, _lock: file })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn records(&self) -> Result<Vec<Record>> {
        let records = read_lines::<Record>(&self.root.join("attempts.jsonl"))?;
        if let Some(record) = records.iter().find(|r| r.schema_version != 1) {
            return Err(format!("Unsupported ledger schema {}", record.schema_version).into());
        }
        Ok(records)
    }

    pub fn append(&self, record: &Record) -> Result<()> {
        let path = self.root.join("attempts.jsonl");
        let mut line = serde_json::to_vec(record)?;
        line.push(b'\n');
        self.reserve(line.len() as u64, 0)?;
        let mut file = File::options().create(true).append(true).open(path)?;
        let original_len = file.metadata()?.len();
        if let Err(error) = file.write_all(&line).and_then(|_| file.sync_data()) {
            file.set_len(original_len)?;
            return Err(error.into());
        }
        Ok(())
    }

    pub fn reserve(&self, added: u64, replaced: u64) -> Result<()> {
        if used(&self.root)?
            .saturating_sub(replaced)
            .saturating_add(added)
            >= CAP
        {
            return Err("Scan ledger would exceed its 49 MB storage ceiling".into());
        }
        Ok(())
    }

    pub fn write_lines(
        &self,
        name: &str,
        records: impl IntoIterator<Item = impl Serialize>,
    ) -> Result<()> {
        self.replace(name, |file| {
            let mut writer = BufWriter::new(file);
            for record in records {
                serde_json::to_writer(&mut writer, &record)?;
                writer.write_all(b"\n")?;
            }
            writer.flush()?;
            Ok(())
        })
    }

    pub fn replace(&self, name: &str, write: impl FnOnce(&mut File) -> Result<()>) -> Result<()> {
        let path = self.root.join(name);
        let mut tmp = tempfile::NamedTempFile::new_in(&self.root)?;
        write(tmp.as_file_mut())?;
        let added = tmp.as_file().metadata()?.len();
        // The temp file is already counted in the directory.
        self.reserve(0, path.metadata().map_or(0, |m| m.len()))?;
        if added >= CAP {
            return Err("Scan ledger file exceeds storage ceiling".into());
        }
        tmp.as_file().sync_all()?;
        tmp.persist(path)?;
        File::open(&self.root)?.sync_all()?;
        Ok(())
    }

    pub fn update_latest(&self, rows: &[Record]) -> Result<()> {
        let latest = latest(rows);
        self.write_lines(
            "latest.jsonl",
            latest.into_iter().map(|(url, r)| {
                json!({"original_url":url, "ledger_id":r.ledger_id, "status":r.status,
                "failure_class":r.failure_class, "scanned_at":r.scanned_at})
            }),
        )
    }

    pub fn merge(&self, mut rows: Vec<Record>) -> Result<Vec<Record>> {
        let mut previous = self.records()?;
        let mut indices: HashMap<_, _> = previous
            .iter()
            .enumerate()
            .map(|(index, row)| (row.ledger_id.clone(), index))
            .collect();
        rows.sort_by(|a, b| a.order().cmp(&b.order()));
        let mut changed = false;
        for row in rows {
            if let Some(&index) = indices.get(&row.ledger_id) {
                // Refresh normalized imports when an importer learns to map
                // additional facts. A rerun is a distinct immutable entry.
                let existing = &previous[index];
                if existing.previous_id.is_none()
                    && existing.campaign_entry.is_none()
                    && serde_json::to_value(existing)? != serde_json::to_value(&row)?
                {
                    previous[index] = row;
                    changed = true;
                }
            } else {
                indices.insert(row.ledger_id.clone(), previous.len());
                previous.push(row);
                changed = true;
            }
        }
        if changed {
            self.write_lines("attempts.jsonl", &previous)?;
        }
        self.update_latest(&previous)?;
        Ok(previous)
    }
}

pub(super) fn latest(rows: &[Record]) -> BTreeMap<&str, &Record> {
    let mut latest = BTreeMap::<&str, &Record>::new();
    for row in rows {
        if let Some(url) = row.original_url.as_deref() {
            let record = latest.entry(url).or_insert(row);
            if record.order() < row.order() {
                *record = row;
            }
        }
    }
    latest
}

pub(super) fn used(root: &Path) -> Result<u64> {
    let mut total = 0u64;
    for entry in root.read_dir()? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            total = total.saturating_add(used(&entry.path())?);
        } else {
            total = total.saturating_add(entry.metadata()?.len());
        }
    }
    Ok(total)
}

fn read_lines<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    BufReader::new(file)
        .lines()
        .enumerate()
        .map(|(i, line)| {
            serde_json::from_str(&line?).map_err(|error| {
                format!(
                    "{} line {}: {error}",
                    privacy::text(&path.display().to_string()),
                    i + 1
                )
                .into()
            })
        })
        .collect()
}

fn repair_tail(path: &Path) -> Result<()> {
    let mut file = match File::options().read(true).write(true).open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let len = file.metadata()?.len();
    if len == 0 {
        return Ok(());
    }
    let mut tail = [0; 4096];
    let mut stop = len;
    while stop > 0 {
        let start = stop.saturating_sub(tail.len() as u64);
        let bytes = &mut tail[..(stop - start) as usize];
        file.seek(SeekFrom::Start(start))?;
        file.read_exact(bytes)?;
        if let Some(index) = bytes.iter().rposition(|&b| b == b'\n') {
            let keep = start + index as u64 + 1;
            if keep < len {
                file.set_len(keep)?;
                file.sync_data()?;
            }
            return Ok(());
        }
        stop = start;
    }
    file.set_len(0)?;
    file.sync_data()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_is_idempotent_and_latest_orders_same_second_tiers() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().to_owned()).unwrap();
        let record = Record {
            original_url: Some("https://example.invalid/app.zip".into()),
            token: "app".into(),
            scanned_at: Some("2026-11-24T00:00:00+00:00".into()),
            ..Record::default()
        };
        let low = record.clone().seal("tier 1").unwrap();
        let high = Record {
            stage_order: 1,
            ..record
        }
        .seal("tier 2")
        .unwrap();
        store.merge(vec![high.clone(), low.clone()]).unwrap();
        assert_eq!(store.merge(vec![low, high.clone()]).unwrap().len(), 2);
        assert_eq!(
            latest(&store.records().unwrap())
                .into_values()
                .next()
                .unwrap()
                .ledger_id,
            high.ledger_id
        );
    }

    #[test]
    fn readers_recover_an_interrupted_append() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_owned();
        let store = Store::open(path.clone()).unwrap();
        store
            .append(&Record::default().seal("fixture").unwrap())
            .unwrap();
        let history = path.join("attempts.jsonl");
        let len = history.metadata().unwrap().len();
        File::options()
            .append(true)
            .open(&history)
            .unwrap()
            .write_all(b"{\"interrupted\"")
            .unwrap();
        drop(store);
        let store = Store::open(path).unwrap();
        assert_eq!(store.records().unwrap().len(), 1);
        assert_eq!(history.metadata().unwrap().len(), len);
    }
}

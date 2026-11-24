use crate::{
    AnyResult, Candidate, Failure, HttpEvidence, Seed,
    artifact::{self, Outcome, Probe, ScanOptions},
    atomic,
    connectors::{ConnectorId, Context, parse_seed},
    digest,
    http::{Traffic, Transport},
    normalized_url, now, recorded_url,
};
use scan_core::ScanResult;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    thread,
};

pub const SCANNER_COMMIT: &str = env!("SOURCE_TOOLS_COMMIT");

#[derive(Clone)]
pub struct Run {
    pub connector: ConnectorId,
    pub input: PathBuf,
    pub out: PathBuf,
    pub cache: Option<PathBuf>,
    pub pinned: bool,
    pub limit: usize,
    pub options: ScanOptions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Replay {
    pub connector: ConnectorId,
    pub seed: Seed,
    pub artifact: Option<String>,
    #[serde(default)]
    pub download_url: Option<String>,
    pub options: ScanOptions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FailureRecord {
    pub candidate_id: String,
    pub name: String,
    pub source: ConnectorId,
    pub stage: String,
    pub failure_class: String,
    pub message: String,
    pub evidence: HttpEvidence,
    pub container: Option<String>,
    pub container_listing: Vec<String>,
    pub scanner_error: Option<String>,
    pub scanner_commit: String,
    pub scanned_at: String,
    pub replay: Option<Replay>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Record {
    key: String,
    source: ConnectorId,
    identity: Option<Identity>,
    duplicate: Option<Duplicate>,
    result: Option<Row>,
    failure: Option<FailureRecord>,
    #[serde(default)]
    discovered: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Row {
    token: String,
    name: String,
    version: Option<String>,
    url: String,
    container: String,
    detected_format: Option<String>,
    status: String,
    unscannable_reason: Option<String>,
    architectures: Vec<String>,
    native_apple_silicon: Option<bool>,
    universal: Option<bool>,
    bundle_id: Option<String>,
    app_name: Option<String>,
    app_version: Option<String>,
    executable: Option<String>,
    min_macos: Option<String>,
    signed: Option<bool>,
    bytes_read: u64,
    bytes_total: Option<u64>,
    requests: u64,
    cask_arch_hint: Vec<serde_json::Value>,
    hint_agrees: Option<bool>,
    inventory: Option<serde_json::Value>,
    script_runtime: Option<serde_json::Value>,
    scanner_commit: String,
    scanned_at: String,
    source: ConnectorId,
    candidate_id: String,
    failure_class: Option<String>,
    probe: Probe,
    scanned: bool,
    budget_attempts: Vec<u64>,
    discovery_bytes_read: u64,
    discovery_requests: u64,
    minimum_system_version_from_feed: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Identity {
    url: String,
    bundle_id: Option<String>,
    vendor_name: Option<String>,
    candidate_id: String,
}

impl Identity {
    fn from_candidate(candidate: &Candidate) -> Self {
        Self {
            url: normalized_url(&recorded_url(&candidate.url)),
            bundle_id: candidate
                .bundle_id
                .as_deref()
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty()),
            vendor_name: candidate
                .vendor
                .as_deref()
                .map(|vendor| {
                    format!(
                        "{}\n{}",
                        vendor.to_lowercase(),
                        identity_name(&candidate.name)
                    )
                })
                .filter(|s| !s.ends_with('\n')),
            candidate_id: candidate.id(),
        }
    }
}

fn identity_name(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Duplicate {
    source: ConnectorId,
    candidate_id: String,
    url: String,
    name: String,
    reason: String,
    kept_candidate_id: String,
}

#[derive(Default)]
struct Seen {
    urls: HashMap<String, String>,
    bundles: HashMap<String, String>,
    names: HashMap<String, String>,
}

impl Seen {
    fn check(
        &self,
        identity: &Identity,
        candidate: &Candidate,
        source: ConnectorId,
    ) -> Option<Duplicate> {
        let (reason, original) = self
            .urls
            .get(&identity.url)
            .map(|id| ("normalized_url", id))
            .or_else(|| {
                identity
                    .bundle_id
                    .as_ref()
                    .and_then(|bundle| self.bundles.get(bundle))
                    .map(|id| ("bundle_id", id))
            })
            .or_else(|| {
                identity
                    .vendor_name
                    .as_ref()
                    .and_then(|name| self.names.get(name))
                    .map(|id| ("vendor_name", id))
            })?;
        Some(Duplicate {
            source,
            candidate_id: identity.candidate_id.clone(),
            url: recorded_url(&candidate.url),
            name: candidate.name.clone(),
            reason: reason.into(),
            kept_candidate_id: original.clone(),
        })
    }

    fn insert(&mut self, identity: &Identity) {
        self.urls
            .entry(identity.url.clone())
            .or_insert_with(|| identity.candidate_id.clone());
        if let Some(bundle) = &identity.bundle_id {
            self.bundles
                .entry(bundle.clone())
                .or_insert_with(|| identity.candidate_id.clone());
        }
        if let Some(name) = &identity.vendor_name {
            self.names
                .entry(name.clone())
                .or_insert_with(|| identity.candidate_id.clone());
        }
    }
}

#[derive(Debug, Default, Serialize)]
pub struct Summary {
    pub discovered: usize,
    pub duplicate: usize,
    pub discovery_failed: usize,
    pub reachable: usize,
    pub scanned: usize,
    pub verified: usize,
    pub failed: usize,
    pub by_status: BTreeMap<String, usize>,
    pub by_failure_class: BTreeMap<String, usize>,
    pub bytes_read: u64,
    pub discovery_bytes_read: u64,
    pub requests: u64,
    pub bytes_per_app_median: Option<u64>,
    pub bytes_per_app_p95: Option<u64>,
    pub cancelled: bool,
    pub robots_bytes_read_this_invocation: u64,
}

impl Summary {
    fn from_records(records: impl Iterator<Item = Record>) -> Self {
        let mut summary = Self::default();
        let mut bytes = Vec::new();
        for record in records {
            summary.discovered += usize::from(record.discovered);
            summary.duplicate += usize::from(record.duplicate.is_some());
            if let Some(failure) = record.failure {
                summary.failed += 1;
                summary.discovery_failed += usize::from(!record.discovered);
                *summary
                    .by_failure_class
                    .entry(failure.failure_class)
                    .or_default() += 1;
            }
            if let Some(row) = record.result {
                summary.reachable += usize::from(row.probe.reachable);
                summary.scanned += usize::from(row.scanned);
                summary.verified += usize::from(row.status == "verified");
                if row.scanned {
                    bytes.push(row.bytes_read);
                }
                summary.bytes_read += row.bytes_read;
                summary.discovery_bytes_read += row.discovery_bytes_read;
                summary.requests += row.requests;
                *summary.by_status.entry(row.status).or_default() += 1;
            }
        }
        bytes.sort_unstable();
        if !bytes.is_empty() {
            let middle = bytes.len() / 2;
            summary.bytes_per_app_median = Some(if bytes.len() % 2 == 0 {
                bytes[middle - 1].midpoint(bytes[middle])
            } else {
                bytes[middle]
            });
            summary.bytes_per_app_p95 = Some(bytes[(bytes.len() * 95).div_ceil(100) - 1]);
        }
        summary
    }
}

struct Journal {
    file: File,
    records: Vec<Record>,
    keys: HashSet<String>,
    seen: Seen,
}

impl Journal {
    fn open(out: &Path) -> AnyResult<Self> {
        let path = out.join("checkpoint.jsonl");
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .append(true)
            .open(&path)?;
        let mut records = Vec::<Record>::new();
        let mut complete = 0;
        let mut reader = BufReader::new(&mut file);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            let size = reader.read_until(b'\n', &mut bytes)?;
            if bytes.last() != Some(&b'\n') {
                break;
            }
            complete += size as u64;
            records.push(
                serde_json::from_slice(&bytes)
                    .map_err(|error| format!("invalid checkpoint at byte {complete}: {error}"))?,
            );
        }
        drop(reader);
        if complete != file.metadata()?.len() {
            file.set_len(complete)?;
            file.sync_data()?;
        }
        let mut keys = HashSet::new();
        let mut seen = Seen::default();
        for record in &records {
            if !keys.insert(record.key.clone()) {
                return Err("checkpoint contains duplicate events".into());
            }
            if let Some(identity) = &record.identity {
                seen.insert(identity);
            }
        }
        Ok(Self {
            file,
            records,
            keys,
            seen,
        })
    }

    fn append(&mut self, record: Record) -> AnyResult<()> {
        if self.keys.contains(&record.key) {
            return Err("duplicate checkpoint event".into());
        }
        let mut line = serde_json::to_vec(&record)?;
        line.push(b'\n');
        self.file.write_all(&line)?;
        self.file.sync_data()?;
        self.keys.insert(record.key.clone());
        if let Some(identity) = &record.identity {
            self.seen.insert(identity);
        }
        self.records.push(record);
        Ok(())
    }

    fn export(&self, config: &Run, cancelled: bool, robots_bytes: u64) -> AnyResult<Summary> {
        let current = config.out.join(config.connector.to_string());
        let records = || {
            self.records
                .iter()
                .filter(|record| record.source == config.connector)
        };
        write_lines(
            &current.join("results.jsonl"),
            records().filter_map(|r| r.result.as_ref()),
        )?;
        write_lines(
            &current.join("duplicates.jsonl"),
            records().filter_map(|r| r.duplicate.as_ref()),
        )?;
        let mut classes: BTreeMap<&str, Vec<&FailureRecord>> = BTreeMap::new();
        for failure in self
            .records
            .iter()
            .filter_map(|record| record.failure.as_ref())
        {
            classes
                .entry(&failure.failure_class)
                .or_default()
                .push(failure);
        }
        for (class, records) in &classes {
            let class = safe_class(class)?;
            write_lines(
                &config.out.join("failures").join(format!("{class}.jsonl")),
                records.iter().copied(),
            )?;
        }
        crate::triage::write_triage(&config.out, &classes)?;
        let mut summary = Summary::from_records(records().cloned());
        summary.cancelled = cancelled;
        summary.robots_bytes_read_this_invocation = robots_bytes;
        atomic(&current.join("summary.json"), |file| {
            serde_json::to_writer_pretty(&mut *file, &summary)?;
            writeln!(file)?;
            Ok(())
        })?;
        Ok(summary)
    }
}

pub(crate) fn safe_class(class: &str) -> AnyResult<&str> {
    if class.is_empty()
        || class.len() > 128
        || !class
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_:-.".contains(&b))
        || !class.as_bytes()[0].is_ascii_alphabetic()
    {
        return Err("invalid failure class".into());
    }
    Ok(class)
}

pub(crate) fn write_lines<'a, T: Serialize + 'a>(
    path: &Path,
    lines: impl IntoIterator<Item = &'a T>,
) -> AnyResult<()> {
    atomic(path, |file| {
        let mut writer = std::io::BufWriter::new(file);
        for line in lines {
            serde_json::to_writer(&mut writer, line)?;
            writer.write_all(b"\n")?;
        }
        writer.flush()?;
        Ok(())
    })
}

pub fn lock(out: &Path) -> AnyResult<File> {
    fs::create_dir_all(out)?;
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(out.join(".sources.lock"))?;
    file.try_lock()
        .map_err(|error| format!("cannot lock output directory {}: {error}", out.display()))?;
    Ok(file)
}

fn pin_input(input: &mut File, config: &Run) -> AnyResult<()> {
    use std::io::Seek as _;
    let mut buffer = [0; 16 * 1024];
    let mut hash = Sha256::new();
    loop {
        let bytes = input.read(&mut buffer)?;
        if bytes == 0 {
            break;
        }
        hash.update(&buffer[..bytes]);
    }
    input.rewind()?;
    let spec = serde_json::json!({"version":1, "sha256":crate::encode_hex(&hash.finalize()),
        "pinned":config.pinned, "scan_options":config.options});
    let path = config
        .out
        .join(config.connector.to_string())
        .join("input.json");
    match File::open(&path) {
        Ok(file) => {
            let before: serde_json::Value = serde_json::from_reader(file)?;
            if before != spec {
                return Err("input or scan options changed, use a fresh output directory".into());
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            atomic(&path, |file| {
                serde_json::to_writer(file, &spec)?;
                Ok(())
            })?;
        }
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn run(
    config: &Run,
    transport: &dyn Transport,
    robots_bytes: impl FnOnce() -> u64,
) -> AnyResult<Summary> {
    let _lock = lock(&config.out)?;
    let mut input = File::open(&config.input)?;
    pin_input(&mut input, config)?;
    let mut journal = Journal::open(&config.out)?;
    let seeds = BufReader::new(input).lines().filter_map(|line| {
        let line = match line {
            Ok(line) => line,
            Err(_) => {
                return Some((
                    Seed::default(),
                    Some(Failure::new(
                        "parse_error:input",
                        "could not read an input line",
                    )),
                ));
            }
        };
        let line = line.trim().trim_start_matches('\u{feff}');
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        Some(match parse_seed(line) {
            Ok(mut seed) => {
                seed.direct |= config.pinned;
                (seed, None)
            }
            Err(error) => (Seed::default(), Some(error)),
        })
    });
    let connector = config.connector.connector();
    let mut pending = Vec::new();
    let mut consumed = 0;
    let mut last_export = journal.records.len();
    let mut failed = false;
    let mut input_index = 0;
    let mut seeds = connector.discover(Box::new(seeds), transport, config.cache.as_deref());
    while consumed < config.limit && !transport.cancelled() {
        let Some(discovered) = seeds.next() else {
            break;
        };
        input_index += 1;
        let mut discovery_traffic = discovered.traffic;
        let candidates = match discovered.candidates {
            Ok(candidates) => candidates,
            Err(error) => {
                consumed += 1;
                if error.class == "cancelled" {
                    break;
                }
                let key = digest(&format!("{}:{input_index}:discover", config.connector));
                if !journal.keys.contains(&key) {
                    journal.append(seed_failure(
                        config,
                        key,
                        &discovered.seed,
                        None,
                        error,
                        "discover",
                        &discovery_traffic,
                    ))?;
                }
                continue;
            }
        };
        for (index, candidate) in candidates.into_iter().enumerate() {
            if consumed >= config.limit || transport.cancelled() {
                break;
            }
            let key = digest(&format!(
                "{}:{input_index}:{index}:{}",
                config.connector,
                candidate.id()
            ));
            if journal.keys.contains(&key) {
                consumed += 1;
                continue;
            }
            let mut context = Context::new(transport, config.cache.as_deref());
            let resolved = connector.resolve(&candidate, &mut context);
            discovery_traffic.bytes += context.traffic.bytes;
            discovery_traffic.requests += context.traffic.requests;
            let resolved = match resolved {
                Ok(candidates) if !candidates.is_empty() => candidates,
                other => {
                    let error = other.err().unwrap_or_else(|| {
                        Failure::new("no_mac_assets", "resolver produced no direct artifacts")
                    });
                    if error.class == "cancelled" {
                        break;
                    }
                    consumed += 1;
                    journal.append(seed_failure(
                        config,
                        key,
                        &candidate.seed,
                        Some(&candidate),
                        error,
                        "resolve",
                        &discovery_traffic,
                    ))?;
                    discovery_traffic = Traffic::default();
                    continue;
                }
            };
            for (alternative, candidate) in resolved.into_iter().enumerate() {
                if consumed >= config.limit || transport.cancelled() {
                    break;
                }
                consumed += 1;
                let key = if alternative == 0 {
                    key.clone()
                } else {
                    digest(&format!("{key}:{alternative}"))
                };
                if journal.keys.contains(&key) {
                    continue;
                }
                let identity = Identity::from_candidate(&candidate);
                if let Some(duplicate) = journal.seen.check(&identity, &candidate, config.connector)
                {
                    journal.append(Record {
                        key,
                        source: config.connector,
                        identity: None,
                        duplicate: Some(duplicate),
                        result: None,
                        failure: None,
                        discovered: true,
                    })?;
                    continue;
                }
                // Reserve before starting both workers so completion order cannot change deduplication.
                journal.seen.insert(&identity);
                pending.push((
                    key,
                    identity,
                    candidate,
                    std::mem::take(&mut discovery_traffic),
                ));
                if pending.len() == 2 {
                    failed |= flush(&mut pending, &mut journal, transport, config)?;
                }
                if journal.records.len() >= last_export + 25 {
                    journal.export(config, false, 0)?;
                    last_export = journal.records.len();
                }
            }
        }
    }
    failed |= flush(&mut pending, &mut journal, transport, config)?;
    journal.export(config, transport.cancelled() || failed, robots_bytes())
}

type ScanJob = (String, Identity, Candidate, Traffic);

fn flush(
    jobs: &mut Vec<ScanJob>,
    journal: &mut Journal,
    transport: &dyn Transport,
    config: &Run,
) -> AnyResult<bool> {
    let jobs = std::mem::take(jobs);
    let mut cancelled = false;
    let completed = thread::scope(|scope| {
        let handles: Vec<_> = jobs
            .into_iter()
            .map(|(key, identity, candidate, traffic)| {
                scope.spawn(move || {
                    let outcome = artifact::inspect(transport, &candidate, config.options);
                    (key, identity, candidate, traffic, outcome)
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| handle.join().map_err(|_| "scanner worker panicked"))
            .collect::<Result<Vec<_>, _>>()
    })?;
    for (key, identity, candidate, traffic, outcome) in completed {
        if outcome
            .failure
            .as_ref()
            .is_some_and(|error| error.class == "cancelled")
        {
            cancelled = true;
            continue;
        }
        journal.append(scanned(
            config, key, identity, &candidate, &traffic, outcome,
        ))?;
    }
    Ok(cancelled)
}

fn seed_failure(
    config: &Run,
    key: String,
    seed: &Seed,
    candidate: Option<&Candidate>,
    error: Failure,
    stage: &str,
    traffic: &Traffic,
) -> Record {
    let id = candidate
        .map(Candidate::id)
        .unwrap_or_else(|| digest(&format!("{}\n{}", config.connector, seed.url)));
    let mut seed = seed.clone();
    let replayable = seed.url == recorded_url(&seed.url) && !seed.url.is_empty();
    seed.url = recorded_url(&seed.url);
    let replay = replayable.then(|| Replay {
        connector: config.connector,
        seed: seed.clone(),
        artifact: None,
        download_url: None,
        options: config.options,
    });
    let mut row = empty_row(
        config.connector,
        id.clone(),
        seed.name.clone(),
        seed.url.clone(),
        seed.version.clone(),
        seed.format_guess.as_deref(),
    );
    row.failure_class = Some(error.class.clone());
    row.unscannable_reason = Some(error.message.clone());
    row.discovery_bytes_read = traffic.bytes;
    row.discovery_requests = traffic.requests;
    let failure = make_failure(&row, error, stage, None, None, replay);
    Record {
        key,
        source: config.connector,
        identity: None,
        duplicate: None,
        result: Some(row),
        failure: Some(failure),
        discovered: candidate.is_some(),
    }
}

fn scanned(
    config: &Run,
    key: String,
    mut identity: Identity,
    candidate: &Candidate,
    discovery: &Traffic,
    outcome: Outcome,
) -> Record {
    let result = outcome.result.as_ref();
    let mut row = empty_row(
        config.connector,
        candidate.id(),
        candidate.name.clone(),
        recorded_url(&candidate.url),
        candidate.version.clone(),
        candidate.format_guess.as_deref(),
    );
    row.bundle_id = candidate.bundle_id.clone();
    row.probe = outcome.probe;
    row.bytes_total = row.probe.bytes_total;
    row.bytes_read = outcome.traffic.bytes;
    row.requests = outcome.traffic.requests;
    row.discovery_bytes_read = discovery.bytes;
    row.discovery_requests = discovery.requests;
    row.scanned = result.is_some();
    row.budget_attempts = outcome.attempts;
    row.minimum_system_version_from_feed = candidate.minimum_system_version.clone();
    if let Some(result) = result {
        enrich(&mut row, result);
    }
    if outcome.failure.is_none() {
        row.status = if result.is_some() {
            "verified"
        } else {
            "partial"
        }
        .into();
    } else if !row.architectures.is_empty() || row.app_name.is_some() || row.app_version.is_some() {
        row.status = "partial".into();
    }
    if identity.bundle_id.is_none() {
        identity.bundle_id = result
            .and_then(|r| r.bundle_id.as_deref())
            .map(str::to_lowercase);
    }
    let failure = outcome.failure.map(|error| {
        row.failure_class = Some(error.class.clone());
        row.unscannable_reason = Some(error.message.clone());
        let original = recorded_url(&candidate.url);
        let replay = (original == candidate.url).then(|| Replay {
            connector: config.connector,
            seed: candidate.seed.clone(),
            artifact: Some(original),
            download_url: candidate.download_url.clone(),
            options: config.options,
        });
        make_failure(
            &row,
            error,
            if result.is_some() { "scan" } else { "probe" },
            outcome.evidence,
            result,
            replay,
        )
    });
    Record {
        key,
        source: config.connector,
        identity: Some(identity),
        duplicate: None,
        result: Some(row),
        failure,
        discovered: true,
    }
}

fn empty_row(
    source: ConnectorId,
    id: String,
    name: String,
    url: String,
    version: Option<String>,
    guess: Option<&str>,
) -> Row {
    let token = if name.is_empty() {
        id[..16].to_owned()
    } else {
        identity_name(&name)
    };
    Row {
        token,
        name,
        version,
        url,
        container: export_container(guess),
        detected_format: None,
        status: "unscannable".into(),
        unscannable_reason: None,
        architectures: Vec::new(),
        native_apple_silicon: None,
        universal: None,
        bundle_id: None,
        app_name: None,
        app_version: None,
        executable: None,
        min_macos: None,
        signed: None,
        bytes_read: 0,
        bytes_total: None,
        requests: 0,
        cask_arch_hint: Vec::new(),
        hint_agrees: None,
        inventory: None,
        script_runtime: None,
        scanner_commit: SCANNER_COMMIT.into(),
        scanned_at: now(),
        source,
        candidate_id: id,
        failure_class: None,
        probe: Probe::default(),
        scanned: false,
        budget_attempts: Vec::new(),
        discovery_bytes_read: 0,
        discovery_requests: 0,
        minimum_system_version_from_feed: None,
    }
}

fn export_container(format: Option<&str>) -> String {
    match format {
        Some(format @ ("zip" | "dmg" | "pkg" | "tar.gz")) => format.into(),
        _ => "other".into(),
    }
}

fn enrich(row: &mut Row, result: &ScanResult) {
    row.detected_format = result.format.map(str::to_owned);
    if result.format.is_some() {
        row.container = export_container(result.format);
    }
    row.app_name = result.name.clone();
    row.app_version = result.version.clone();
    row.bundle_id = result.bundle_id.clone().or_else(|| row.bundle_id.clone());
    row.executable = result
        .executable_name
        .clone()
        .or_else(|| result.executable_path.clone());
    row.min_macos = result.min_macos.clone();
    row.architectures = result
        .architectures
        .iter()
        .filter(|a| a.header_verified)
        .map(|a| a.name.to_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let arm = row
        .architectures
        .iter()
        .any(|a| matches!(a.as_str(), "arm64" | "arm64e"));
    let intel = row
        .architectures
        .iter()
        .any(|a| matches!(a.as_str(), "x86_64" | "i386"));
    if artifact::verified(result) {
        row.universal = Some(arm && intel);
        row.native_apple_silicon = if !arm && intel {
            Some(false)
        } else if arm && result.bundle_path.is_none() {
            Some(true)
        } else {
            None
        };
    }
    if result
        .architectures
        .iter()
        .any(|a| a.code_signature_present == Some(true))
    {
        row.signed = Some(true);
    } else if !result.architectures.is_empty()
        && result
            .architectures
            .iter()
            .all(|a| a.code_signature_present == Some(false))
    {
        row.signed = Some(false);
    }
}

fn make_failure(
    row: &Row,
    error: Failure,
    stage: &str,
    evidence: Option<HttpEvidence>,
    result: Option<&ScanResult>,
    replay: Option<Replay>,
) -> FailureRecord {
    let container_listing = result
        .into_iter()
        .flat_map(|r| {
            r.nested_artifacts
                .iter()
                .map(String::as_str)
                .chain(r.candidate_executables.iter().map(|a| a.path.as_str()))
                .chain(
                    r.installer
                        .iter()
                        .flat_map(|r| r.remote_components.iter().map(String::as_str)),
                )
        })
        .take(12)
        .map(|item| recorded_url(item).chars().take(192).collect())
        .collect();
    FailureRecord {
        source: row.source,
        candidate_id: row.candidate_id.clone(),
        name: row.name.clone(),
        stage: stage.into(),
        failure_class: error.class,
        message: error.message,
        evidence: error
            .http
            .map(|boxed| *boxed)
            .or(evidence)
            .unwrap_or_else(|| HttpEvidence {
                url: row.url.clone(),
                ..HttpEvidence::default()
            }),
        container: row
            .detected_format
            .clone()
            .or_else(|| (row.container != "other").then(|| row.container.clone())),
        container_listing,
        scanner_error: result.and_then(|r| r.error.clone()),
        scanner_commit: row.scanner_commit.clone(),
        scanned_at: row.scanned_at.clone(),
        replay,
    }
}

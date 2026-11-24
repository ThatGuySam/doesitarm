use super::{
    Result,
    capture::Capture,
    classify, import, privacy,
    store::{Origin, Record, Settings, Store, latest},
};
use crate::{Deadline, Output, http};
use scan_core::{Profile, REMOTE_BUDGET_TIERS, ScanLimits, Target};
use serde_json::{Value, json};
use std::{
    env,
    fs::{self, File},
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};

pub(super) fn cache() -> Result<PathBuf> {
    let home = env::var_os("HOME").ok_or("HOME is required for the scan ledger cache")?;
    let path = PathBuf::from(home).join(".cache/doesitarm-scanner-ledger");
    fs::create_dir_all(&path)?;
    Ok(path)
}

pub(super) fn network_guard() -> Result<(PathBuf, File)> {
    let dir = cache()?;
    let lock = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(dir.join("http.lock"))?;
    lock.lock()?;
    let output = Command::new("df").arg("-Pk").arg(&dir).output()?;
    let available = String::from_utf8(output.stdout)?
        .lines()
        .last()
        .and_then(|row| row.split_whitespace().nth(3))
        .and_then(|n| n.parse::<u64>().ok());
    if !output.status.success() || available.is_none_or(|n| n < 20_000_000) {
        return Err("The ledger cache requires at least 20 GB free before scanning".into());
    }
    Ok((dir, lock))
}

pub(super) fn limits(settings: &Settings) -> Result<ScanLimits> {
    let profile: Profile = settings
        .profile
        .as_deref()
        .unwrap_or("remote-cli")
        .parse()?;
    let mut limits = ScanLimits::for_profile(profile);
    if let Some(tier) = settings.tier_bytes {
        limits.byte_budget = tier;
    }
    Ok(limits)
}

pub(super) fn target(settings: &Settings) -> Target<'_> {
    let Some(target) = &settings.target else {
        return Target::Auto;
    };
    let Some(path) = target["path"].as_str() else {
        return Target::Auto;
    };
    if target["kind"] == "bundle" {
        Target::Bundle(path)
    } else {
        Target::Executable(path)
    }
}

pub(super) fn capture_url(
    url: &str,
    settings: &Settings,
    keep_bytes: bool,
    stop: Option<Instant>,
) -> Result<(Output, Capture, u64)> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Ledger live scans require a recorded HTTP or HTTPS artifact".into());
    }
    let (spool_dir, _lock) = network_guard()?;
    let start = Instant::now();
    let mut duration = [settings.deadline_ms, settings.timeout_ms]
        .into_iter()
        .flatten()
        .min()
        .map_or(Duration::from_secs(45), Duration::from_millis);
    let mut limits = limits(settings)?;
    if limits.profile == Profile::Worker {
        duration = duration.min(Duration::from_millis(scan_core::WORKER_WALL_TIME_MS.into()));
    }
    if limits.profile == Profile::Local {
        limits.profile = Profile::RemoteCli;
        limits.byte_budget = settings.tier_bytes.unwrap_or(REMOTE_BUDGET_TIERS[0]);
    }
    if let Some(stop) = stop {
        duration = duration.min(stop.saturating_duration_since(start));
    }
    let delay = settings
        .flags
        .iter()
        .position(|f| f == "--request-delay-ms")
        .and_then(|i| settings.flags.get(i + 1)?.parse().ok())
        .unwrap_or(0);
    let has_flag = |flag: &str| settings.flags.iter().any(|f| f == flag);
    let mut capture = Capture::new(keep_bytes);
    let result = http::scan_with_capture(
        url,
        limits,
        target(settings),
        &http::Options {
            allow_stream: has_flag("--allow-stream"),
            allow_http: has_flag("--allow-http"),
            delay: Duration::from_millis(delay),
            spool_dir: Some(spool_dir),
        },
        Some(Deadline { start, duration }),
        Some(&mut capture),
    );
    Ok((result, capture, start.elapsed().as_millis() as u64))
}

pub(super) fn enrich(record: &mut Record, capture: &Capture) -> Result<()> {
    if let Some(probe) = &capture.probe {
        record.final_url = Some(probe.final_url.clone());
        record.redirect_chain.clone_from(&probe.redirects);
        record.http_status = record.http_status.or(Some(probe.status));
        for (key, value) in &probe.headers {
            record
                .headers
                .entry(key.clone())
                .or_insert_with(|| value.clone());
        }
    }
    if let Some(response) = capture
        .phases
        .iter()
        .rev()
        .find_map(|phase| phase.response.as_ref())
    {
        record.final_url = Some(response.final_url.clone());
        record.http_status = record.http_status.or(Some(response.status));
        if record.redirect_chain.last() != Some(&response.final_url)
            && !response.redirects.is_empty()
        {
            record
                .redirect_chain
                .extend(response.redirects.iter().skip(1).cloned());
        }
        for (name, value) in &response.headers {
            if !matches!(name.as_str(), "content-length" | "content-range") {
                record
                    .headers
                    .entry(name.clone())
                    .or_insert_with(|| value.clone());
            }
        }
    }
    if !capture.prefix.is_empty() {
        record.first_512_hex = Some(privacy::hex(&capture.prefix));
    }
    if capture.probe.is_some() || capture.probe_error.is_some() {
        record
            .read_log
            .push(json!({"offset":0,"length":1,"purpose":"http-range-probe"}));
    }
    for phase in &capture.phases {
        for span in &phase.read_log {
            record.read_log.push(serde_json::to_value(span)?);
        }
        if phase.log_overflow > 0 {
            record
                .read_log
                .push(json!({"omitted_reads":phase.log_overflow,
                "full_log_sha256":phase.log_sha256,"purpose":phase.transport}));
        }
    }
    if let Some(scan) = &record.result {
        let facts = json!({"bundle_path":scan["bundle_path"], "executable_path":scan["executable_path"],
            "nested_artifacts":scan["nested_artifacts"], "installer_payload_bundles":scan["installer"]["payload_bundles"],
            "inventory_binary_count":scan["inventory"]["binary_count"]});
        if facts.as_object().unwrap().values().any(|v| !v.is_null()) {
            record.container_summary = Some(facts);
        }
    }
    Ok(())
}

pub(super) fn entry_for(before: &Record) -> Value {
    let mut entry = if before.evidence["artifact"].is_object() {
        before.evidence["artifact"].clone()
    } else {
        json!({})
    };
    entry["name"] = json!(before.name);
    entry["token"] = json!(before.token);
    entry["source"] = json!(before.source);
    entry["url"] = json!(before.original_url);
    entry["container"] = json!(before.container_format);
    entry
}

pub(super) fn rerun_settings(before: &Record) -> Settings {
    let mut settings = before.settings.clone();
    if settings.profile.as_deref() == Some("local") || settings.profile.is_none() {
        settings = Settings {
            profile: Some("remote-cli".into()),
            tier_bytes: Some(REMOTE_BUDGET_TIERS[0]),
            flags: vec!["--allow-stream".into(), "--allow-http".into()],
            target: settings.target,
            ..Settings::default()
        };
    }
    if settings.tier_bytes.is_none() {
        settings.tier_bytes = Some(REMOTE_BUDGET_TIERS[0]);
    }
    if settings.deadline_ms.is_none() && settings.timeout_ms.is_none() {
        settings.deadline_ms = Some(45_000);
    }
    settings
}

pub(super) fn rerun_record(before: &Record, keep_bytes: bool) -> Result<(Record, Capture)> {
    if !before.rerunnable() {
        return Err(
            "Recorded artifact needs a public refresh route or source-specific replay".into(),
        );
    }
    let settings = rerun_settings(before);
    let entry = entry_for(before);
    let (result, capture, elapsed) =
        capture_url(entry["url"].as_str().unwrap(), &settings, keep_bytes, None)?;
    let result = serde_json::to_value(result)?;
    let mut row = import::live_record(&entry, settings, &result, elapsed);
    enrich(&mut row, &capture)?;
    row.previous_id = Some(before.ledger_id.clone());
    row.change = Some(classify::compare(before, &row).into());
    row.provenance = before.provenance.clone();
    row.evidence = json!({"artifact":entry});
    Ok((row.seal(&format!("rerun:{}", before.ledger_id))?, capture))
}

pub(super) fn rerun(root: &Path, selector: &str, limit: usize) -> Result<()> {
    let rows = Store::open(root.to_path_buf())?.records()?;
    let records = if let Some(row) = rows.iter().find(|row| row.ledger_id == selector) {
        vec![row]
    } else {
        latest(&rows)
            .into_values()
            .filter(|row| {
                row.failure_class
                    .as_deref()
                    .is_some_and(|class| selector == "--all-failures" || selector == class)
            })
            .collect()
    };
    if records.is_empty() {
        return Err("No attempt matches this ID or failure class".into());
    }
    let mut completed = 0;
    for row in records {
        if completed == limit {
            break;
        }
        if !row.rerunnable() {
            println!(
                "Skipped {} ({}) because its source requires a separate replay route",
                row.ledger_id, row.status
            );
            continue;
        }
        let (attempt, _) = rerun_record(row, false)?;
        let store = Store::open(root.to_path_buf())?;
        store.append(&attempt)?;
        completed += 1;
        println!(
            "{} {} {} {}",
            attempt.ledger_id,
            attempt.token,
            attempt.status,
            attempt.change.unwrap_or_default()
        );
    }
    let store = Store::open(root.to_path_buf())?;
    store.update_latest(&store.records()?)?;
    Ok(())
}

fn targets(entry: &Value) -> Vec<Option<Value>> {
    for (field, kind) in [
        ("declared_apps", "bundle"),
        ("declared_binaries", "executable"),
    ] {
        if field == "declared_binaries"
            && entry["artifact_types"].as_array().is_some_and(|items| {
                items
                    .iter()
                    .any(|item| item == "pkg" || item == "installer")
            })
        {
            break;
        }
        if let Some(values) = entry[field].as_array().filter(|v| !v.is_empty()) {
            return values
                .iter()
                .map(|path| Some(json!({"kind":kind,"path":path})))
                .collect();
        }
    }
    vec![None]
}

fn can_escalate(record: &Record, scanner_output: &Value) -> bool {
    record.status == "budget_hit"
        && (matches!(
            record.container_format.as_deref(),
            Some(
                "pkg"
                    | "zip"
                    | "7z"
                    | "tar.gz"
                    | "tar.xz"
                    | "tar.bz2"
                    | "tar.zst"
                    | "tgz"
                    | "txz"
                    | "tbz"
                    | "tbz2"
            )
        ) || scanner_output["source_transport"] == "stream"
            || scanner_output["nested_artifacts"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|value| {
                    let path = value.as_str().unwrap_or_default().to_lowercase();
                    [".pkg", ".mpkg", "/archive.pax.gz"]
                        .iter()
                        .any(|suffix| path.ends_with(suffix))
                }))
}

pub(super) fn continue_catalog(
    root: &Path,
    scanner: &Path,
    limit: usize,
    seconds: u64,
) -> Result<()> {
    let cache = cache()?;
    let job = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(cache.join("campaign.lock"))?;
    job.try_lock()?;
    let manifest = import::manifest(scanner)?;
    let initial = import::campaign_start(scanner, &manifest)?;
    let mut checked = initial;
    let prior = Store::open(root.to_path_buf())?.records()?;
    let done: std::collections::BTreeSet<_> = prior
        .iter()
        .filter(|r| r.campaign_final)
        .filter_map(|r| r.campaign_entry)
        .collect();
    while done.contains(&(checked + 1)) {
        checked += 1;
    }
    let stop = Instant::now() + Duration::from_secs(seconds.min(3600));
    let limit = limit.min(400);
    let mut last_finished = std::collections::BTreeMap::<String, Instant>::new();
    for (i, entry) in manifest.iter().enumerate().skip(checked).take(limit) {
        if stop.saturating_duration_since(Instant::now()) < Duration::from_secs(45) {
            break;
        }
        let url = entry["url"].as_str().ok_or("Catalog entry lacks URL")?;
        let uri = url.parse::<ureq::http::Uri>()?;
        let host = uri
            .host()
            .ok_or("Catalog entry lacks host")?
            .to_ascii_lowercase();
        if let Some(previous) = last_finished.get(&host) {
            thread::sleep(
                Duration::from_secs(1)
                    .saturating_sub(previous.elapsed())
                    .min(stop.saturating_duration_since(Instant::now())),
            );
        }
        let target_choices = targets(entry);
        'target: for (j, target) in target_choices.iter().enumerate() {
            for (k, budget) in REMOTE_BUDGET_TIERS.into_iter().enumerate() {
                if Instant::now() >= stop {
                    break 'target;
                }
                let settings = Settings {
                    profile: Some("remote-cli".into()),
                    tier_bytes: Some(budget),
                    deadline_ms: Some(45_000),
                    timeout_ms: Some(45_000),
                    target: target.clone(),
                    flags: vec![
                        "--allow-stream".into(),
                        "--allow-http".into(),
                        "--request-delay-ms".into(),
                        "75".into(),
                    ],
                };
                let (output, capture, elapsed) = capture_url(url, &settings, false, Some(stop))?;
                let output = serde_json::to_value(output)?;
                let mut row = import::live_record(entry, settings, &output, elapsed);
                enrich(&mut row, &capture)?;
                let retry = k + 1 < REMOTE_BUDGET_TIERS.len() && can_escalate(&row, &output);
                let blocked = matches!(row.http_status, Some(401 | 403 | 404 | 410 | 429));
                let expired = Instant::now() >= stop;
                row.campaign_entry = Some(i + 1);
                row.campaign_final =
                    !expired && !retry && (blocked || j + 1 == target_choices.len());
                row.evidence = json!({"artifact":entry, "manifest_entry":i+1});
                row.provenance.push(Origin {
                    imported_from: format!("scanner/{}", import::MANIFEST),
                    original_line: 1,
                    locator: Some(format!("/entries/{i}")),
                    original_sha256: privacy::sha(serde_json::to_vec(entry)?),
                });
                let row = row.seal(&format!("catalog:{}:{j}:{k}", i + 1))?;
                Store::open(root.to_path_buf())?.append(&row)?;
                println!(
                    "Homebrew {}/{} {} {} {}{}",
                    i + 1,
                    manifest.len(),
                    row.token,
                    budget,
                    row.status,
                    if row.campaign_final { " [done]" } else { "" }
                );
                if row.campaign_final {
                    checked = i + 1;
                }
                if expired || blocked {
                    break 'target;
                }
                if !retry {
                    break;
                }
            }
        }
        if checked != i + 1 {
            break;
        }
        last_finished.insert(host, Instant::now());
    }
    let store = Store::open(root.to_path_buf())?;
    store.update_latest(&store.records()?)?;
    println!("Homebrew progress: {checked}/{}", manifest.len());
    Ok(())
}

use super::{
    Result, classify, privacy,
    store::{Origin, Record, Settings, Store, string, success},
};
use flate2::read::GzDecoder;
use serde_json::{Value, json};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub(super) const MANIFEST: &str = "results/climb/full-run/manifest.json.gz";
const CHECKPOINT: &str = "results/climb/full-run/checkpoint.ndjson";

fn paths(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut children = fs::read_dir(dir)?
        .map(|entry| entry.map(|e| e.path()))
        .collect::<std::io::Result<Vec<_>>>()?;
    children.sort_unstable();
    Ok(children)
}

fn label(path: &Path, root: &Path, prefix: &str) -> String {
    format!(
        "{prefix}/{}",
        path.strip_prefix(root).unwrap_or(path).display()
    )
}

fn origin(path: &str, line: usize, locator: Option<String>, raw: &str) -> Origin {
    Origin {
        imported_from: privacy::text(path),
        original_line: line,
        locator,
        original_sha256: privacy::sha(raw),
    }
}

fn read(path: &Path) -> Result<String> {
    if path.extension().is_some_and(|ext| ext == "gz") {
        let mut text = String::new();
        GzDecoder::new(fs::File::open(path)?).read_to_string(&mut text)?;
        Ok(text)
    } else {
        Ok(fs::read_to_string(path)?)
    }
}

fn jsonl(input: &str) -> impl Iterator<Item = Result<(Value, usize, &str)>> {
    input
        .lines()
        .enumerate()
        .filter(|(_, s)| !s.trim().is_empty())
        .map(|(i, s)| {
            Ok((
                serde_json::from_str(s).map_err(|e| format!("JSONL line {}: {e}", i + 1))?,
                i + 1,
                s,
            ))
        })
}

fn array<'a>(input: &'a str, field: &str) -> Result<Vec<(Value, usize, &'a str)>> {
    let re = regex::Regex::new(&format!(r#""{}"\s*:\s*\["#, regex::escape(field)))?;
    let Some(start) = re.find(input) else {
        return Ok(Vec::new());
    };
    let mut line = input[..start.end()].lines().count();
    let mut rest = &input[start.end()..];
    let mut entries = Vec::new();
    loop {
        let member = rest.trim_start_matches(|ch: char| ch.is_whitespace() || ch == ',');
        line += rest[..rest.len() - member.len()]
            .bytes()
            .filter(|&b| b == b'\n')
            .count();
        if member.starts_with(']') {
            return Ok(entries);
        }
        let mut decoder = serde_json::Deserializer::from_str(member).into_iter::<Value>();
        let row = decoder.next().ok_or("Incomplete JSON array")??;
        let raw = &member[..decoder.byte_offset()];
        entries.push((row, line, raw));
        line += raw.bytes().filter(|&b| b == b'\n').count();
        rest = &member[raw.len()..];
    }
}

pub(super) fn manifest(scanner: &Path) -> Result<Vec<Value>> {
    let input = read(&scanner.join(MANIFEST))?;
    Ok(array(&input, "entries")?
        .into_iter()
        .map(|(value, _, _)| value)
        .collect())
}

pub(super) fn initial_progress(scanner: &Path) -> Result<usize> {
    let input = read(&scanner.join(CHECKPOINT))?;
    let mut count = 0;
    for entry in jsonl(&input) {
        entry?;
        count += 1;
    }
    Ok(count)
}

fn app(row: &Value) -> Record {
    let token = string(row, "token")
        .or_else(|| string(row, "cask"))
        .unwrap_or_default();
    let name = string(row, "name")
        .or_else(|| string(row, "app_name"))
        .or_else(|| {
            row["declared_apps"]
                .as_array()?
                .first()?
                .as_str()
                .map(str::to_owned)
        })
        .unwrap_or_else(|| token.clone());
    Record {
        name,
        token,
        source: string(row, "source").unwrap_or_else(|| "homebrew-cask".into()),
        original_url: string(row, "url"),
        container_format: string(row, "expected_format")
            .or_else(|| string(row, "container"))
            .or_else(|| string(row, "pinned_format")),
        scanner_commit: string(row, "scanner_commit"),
        scanned_at: string(row, "scanned_at"),
        ..Record::default()
    }
}

pub(super) fn properties(row: &mut Record, result: &Value) {
    if let Some(name) = string(result, "name") {
        row.name = name;
    }
    row.container_format = string(result, "format")
        .or_else(|| string(result, "detected_format"))
        .or(row.container_format.take());
    row.artifact_size = result["total_size"]
        .as_u64()
        .or_else(|| result["bytes_total"].as_u64())
        .filter(|&n| n > 0);
    row.bytes_read = result["bytes_read"].as_u64();
    row.bytes_requested = result["bytes_requested"].as_u64();
    row.reads = result["reads"]
        .as_u64()
        .or_else(|| result["requests"].as_u64());
    row.error = string(result, "error").or_else(|| string(result, "unscannable_reason"));
    row.http_status = row.error.as_deref().and_then(classify::http_status);
    for (field, header) in [
        ("source_etag", "etag"),
        ("source_content_type", "content-type"),
    ] {
        if let Some(text) = string(result, field) {
            row.headers.insert(header.into(), text);
        }
    }
    row.info_plist_sha256 = string(&result["diagnostic"], "info_plist_sha256");
    row.main_executable_header_sha256 =
        string(&result["diagnostic"], "main_executable_header_sha256");
    if row.main_executable_header_sha256.is_none() {
        row.main_executable_header_sha256 = string(&result["diagnostic"], "executable_prefix_hex")
            .and_then(|value| privacy::unhex(&value))
            .map(privacy::sha);
    }
    row.result = Some(result.clone());
}

pub(super) fn live_record(
    entry: &Value,
    settings: Settings,
    result: &Value,
    elapsed_ms: u64,
) -> Record {
    let mut record = app(entry);
    properties(&mut record, result);
    record.scanner_commit = Some(env!("SCAN_CLI_COMMIT").into());
    record.scanned_at = Some(super::store::now());
    record.elapsed_ms = Some(elapsed_ms);
    record.status = classify::category(result, settings.target.as_ref(), entry).into();
    record.failure_class = (!success(&record.status)).then(|| record.status.clone());
    record.settings = settings;
    record
}

fn historical(
    entry: &Value,
    attempt: &Value,
    meta: &Value,
    mut provenance: Origin,
    index: usize,
) -> Result<Record> {
    let mut row = app(entry);
    row.stage_order = index as u32;
    let scan = &attempt["scan"];
    properties(&mut row, scan);
    row.scanner_commit = string(attempt, "scanner_commit")
        .or_else(|| string(meta, "scanner_commit_at_start"))
        .or_else(|| string(meta, "scanner_commit"));
    row.scanned_at = string(attempt, "scanned_at").or_else(|| string(meta, "started_at"));
    row.elapsed_ms = attempt["elapsed_seconds"]
        .as_f64()
        .map(|seconds| (seconds * 1000.0).round() as u64);
    row.status =
        string(attempt, "category").unwrap_or_else(|| classify::category(scan, None, entry).into());
    if !success(&row.status) {
        row.failure_class = Some(if row.status == "other" {
            classify::category(scan, attempt.get("target"), entry).into()
        } else {
            row.status.clone()
        });
    }
    let local = attempt.get("evidence_source").is_some() || attempt.get("download").is_some();
    let mut flags: Vec<_> = meta["cli_options"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    let deadline_ms = flags
        .iter()
        .position(|v| v == "--deadline-ms")
        .and_then(|at| {
            if at + 1 < flags.len() {
                let value = flags.remove(at + 1).parse().ok();
                flags.remove(at);
                value
            } else {
                None
            }
        });
    row.settings = Settings {
        profile: Some(if local { "local" } else { "remote-cli" }.into()),
        tier_bytes: attempt["budget"]
            .as_u64()
            .or_else(|| meta["maximum_bytes_per_artifact"].as_u64()),
        timeout_ms: meta["timeout"].as_u64().map(|secs| secs * 1000),
        deadline_ms,
        target: attempt.get("target").cloned(),
        flags,
    };
    let mut context = entry.clone();
    context.as_object_mut().unwrap().remove("attempts");
    row.evidence = json!({"artifact":context, "exit_code": attempt["exit_code"],
        "cli_sha256":meta["cli_sha256"], "campaign_status": entry["category"],
        "download":attempt["download"], "observed_artifact_sha256":attempt["sha256_observed"],
        "evidence_source":attempt["evidence_source"]});
    let discriminator = format!(
        "{}:{}:{index}",
        provenance.imported_from, provenance.original_line
    );
    if entry.get("attempts").is_some() {
        provenance.locator = Some(format!(
            "{}{}{}",
            provenance.locator.unwrap_or_default(),
            "/attempts/",
            index
        ));
    }
    row.provenance.push(provenance);
    row.seal(&discriminator)
}

fn scan_run(path: &Path, scanner: &Path, rows: &mut Vec<Record>) -> Result<()> {
    let input = read(path)?;
    let imported_from = label(path, scanner, "scanner");
    if path.extension().is_some_and(|ext| ext == "ndjson") {
        let meta: Value = serde_json::from_str(&read(&path.with_file_name("metadata.json"))?)?;
        for entry in jsonl(&input) {
            let (entry, line, raw) = entry?;
            for (i, attempt) in entry["attempts"]
                .as_array()
                .into_iter()
                .flatten()
                .enumerate()
            {
                rows.push(historical(
                    &entry,
                    attempt,
                    &meta,
                    origin(&imported_from, line, None, raw),
                    i,
                )?);
            }
        }
    } else {
        let meta: Value = serde_json::from_str(&input)?;
        let field = if meta.get("artifacts").is_some() {
            "artifacts"
        } else {
            "apps"
        };
        for (idx, (entry, line, raw)) in array(&input, field)?.into_iter().enumerate() {
            let from = origin(&imported_from, line, Some(format!("/{field}/{idx}")), raw);
            if let Some(attempts) = entry["attempts"].as_array() {
                for (i, attempt) in attempts.iter().enumerate() {
                    rows.push(historical(&entry, attempt, &meta, from.clone(), i)?);
                }
            } else {
                rows.push(historical(&entry, &entry, &meta, from, 0)?);
            }
        }
    }
    Ok(())
}

fn transport(record: &mut Record, evidence: &Value) {
    record.final_url = string(evidence, "final_url").or(record.final_url.take());
    record.http_status = evidence["status"]
        .as_u64()
        .and_then(|n| n.try_into().ok())
        .or(record.http_status);
    record.artifact_size = evidence["bytes_total"].as_u64().or(record.artifact_size);
    for name in [
        "content-length",
        "accept-ranges",
        "etag",
        "last-modified",
        "content-type",
        "server",
        "content-range",
    ] {
        if let Some(value) = string(&evidence["headers"], name)
            .or_else(|| string(evidence, &name.replace('-', "_")))
            .or_else(|| {
                evidence[&name.replace('-', "_")]
                    .as_u64()
                    .map(|n| n.to_string())
            })
        {
            record.headers.insert(name.into(), value);
        }
    }
    record.first_512_hex = string(evidence, "first_bytes_hex").or(record.first_512_hex.take());
    if let Some(listing) = evidence.get("container_listing").filter(|v| !v.is_null()) {
        record.container_summary = Some(listing.clone());
    }
}

fn projection(row: &Value, failure: &Value, provenance: Origin, index: usize) -> Result<Record> {
    let mut record = app(row);
    let mut result = row.clone();
    result.as_object_mut().unwrap().remove("representations");
    properties(&mut record, &result);
    let evidence = &failure["evidence"];
    transport(&mut record, &row["probe"]);
    transport(&mut record, evidence);
    record.status = string(row, "status").unwrap_or_else(|| "unscannable".into());
    record.failure_class = string(row, "failure_class")
        .or_else(|| string(failure, "failure_class"))
        .or_else(|| (!success(&record.status)).then(|| record.status.clone()));
    record.error = string(evidence, "scanner_error")
        .or_else(|| string(failure, "message"))
        .or(record.error);
    if record.source == "homebrew-cask"
        && !success(&record.status)
        && let Some(reason) = record.error.as_deref()
    {
        let status = if reason.starts_with("unsupported:") {
            "unsupported"
        } else if reason.starts_with("not found:") {
            "not_found"
        } else if reason.starts_with("source:") {
            "source_error"
        } else if reason == "byte budget reached" {
            "budget_exhausted"
        } else if reason.starts_with("invalid data:") {
            "invalid"
        } else {
            ""
        };
        if status.is_empty()
            && !reason.is_empty()
            && reason.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')
        {
            record.failure_class = Some(reason.into());
        } else if !status.is_empty() {
            record.failure_class = Some(
                classify::category(
                    &json!({"status":status, "error":reason}),
                    None,
                    &Value::Null,
                )
                .into(),
            );
        }
    }
    record.settings = Settings {
        profile: (row["scanned"] != false).then(|| "remote-cli".into()),
        tier_bytes: row["budget_attempts"]
            .as_array()
            .and_then(|seq| seq.last()?.as_u64()),
        ..Settings::default()
    };
    record.evidence =
        json!({"stage": failure["stage"], "failure": failure, "result_kind": "source_projection"});
    let discriminator = format!(
        "{}:{}:{index}",
        provenance.imported_from, provenance.original_line
    );
    record.provenance.push(provenance);
    record.seal(&discriminator)
}

fn source_pilot(
    path: &Path,
    data: &Path,
    rows: &mut Vec<Record>,
    catalog: &mut Vec<Value>,
) -> Result<()> {
    let imported_from = label(path, data, "doesitarm-data");
    if path.is_dir() {
        for child in paths(path)? {
            source_pilot(&child, data, rows, catalog)?;
        }
    } else if path.ends_with("checkpoint.jsonl") {
        for item in jsonl(&read(path)?) {
            let (item, line, raw) = item?;
            let origin = origin(&imported_from, line, Some("/result".into()), raw);
            if item["result"].is_object() {
                let mut row = projection(&item["result"], &item["failure"], origin.clone(), 0)?;
                // The pilot stores tier numbers but only one result. Preserve
                // every earlier invocation as a partial observation.
                let budgets = item["result"]["budget_attempts"].as_array();
                if let Some(budgets) = budgets {
                    row.stage_order = budgets.len().saturating_sub(1) as u32;
                    for (i, budget) in budgets
                        .iter()
                        .take(budgets.len().saturating_sub(1))
                        .enumerate()
                    {
                        let partial = Record {
                            status: "unrecorded_outcome".into(),
                            stage_order: i as u32,
                            settings: Settings {
                                tier_bytes: budget.as_u64(),
                                ..row.settings.clone()
                            },
                            result: None,
                            failure_class: None,
                            error: None,
                            bytes_read: None,
                            bytes_requested: None,
                            reads: None,
                            provenance: vec![origin.clone()],
                            evidence: json!({"stage":"scan", "result_kind":"unretained_pilot_tier"}),
                            ..row.clone()
                        };
                        rows.push(partial.seal(&format!("{imported_from}:{line}:earlier:{i}"))?);
                    }
                }
                // Identity and discovery context are available in the cited checkpoint.
                row.evidence["candidate_id"] = item["identity"]["candidate_id"].clone();
                rows.push(row);
            } else {
                catalog.push(
                    json!({"kind":"discovery_duplicate", "provenance":origin, "evidence":item}),
                );
            }
        }
    } else if path.extension().is_some_and(|ext| ext == "md")
        && (path.ends_with("triage.md")
            || path.parent().is_some_and(|p| p.ends_with("agent-tasks")))
    {
        let input = read(path)?;
        for (i, line) in input
            .lines()
            .enumerate()
            .filter(|(_, s)| s.starts_with("## "))
        {
            catalog.push(json!({"kind":"pilot_triage", "text":line, "provenance":origin(&imported_from, i+1, None, line)}));
        }
        catalog.push(
            json!({"kind":"source_document","path":imported_from,"sha256":privacy::sha(&input),
                "content":(input.len() <= 128_000).then_some(input)}),
        );
    }
    Ok(())
}

fn inspections(scanner: &Path, rows: &mut Vec<Record>, catalog: &mut Vec<Value>) -> Result<()> {
    let root = scanner.join("results/edge");
    let path = root.join("inspection.jsonl");
    if path.is_file() {
        let from = label(&path, scanner, "scanner");
        for item in jsonl(&read(&path)?) {
            let (entry, line, raw) = item?;
            for (key, revision) in [("pre_edge_local", "5a7e79a"), ("edge_local", "11a817b")] {
                if let Some(scan) = entry.get(key).filter(|v| v.is_object()) {
                    let mut record = app(&entry);
                    properties(&mut record, scan);
                    record.artifact_size = entry["size"].as_u64();
                    record.scanner_commit = Some(revision.into());
                    record.settings.profile = Some("local".into());
                    record.status =
                        string(scan, "status").unwrap_or_else(|| "unrecorded_outcome".into());
                    if !success(&record.status) {
                        record.failure_class = Some(classify::category(scan, None, &entry).into());
                    }
                    record.container_summary = Some(
                        json!({"outer_listing_entries":entry["outer_listing_entries"],
                        "selected_paths":entry["selected_paths"],"payload_entry_counts":entry["payload_entry_counts"],
                        "zip_footer":entry["zip_footer"]}),
                    );
                    record
                        .provenance
                        .push(origin(&from, line, Some(format!("/{key}")), raw));
                    rows.push(record.seal(&format!("{from}:{line}:{key}"))?);
                }
            }
            if let Some(attempts) = entry["download_attempts"].as_array() {
                for (i, attempt) in attempts.iter().enumerate() {
                    let mut record = app(&entry);
                    record.status =
                        string(attempt, "outcome").unwrap_or_else(|| "unrecorded_outcome".into());
                    record.artifact_size = entry["size"]
                        .as_u64()
                        .or_else(|| attempt["size_at_checkpoint"].as_u64());
                    record.evidence = json!({"stage":"inspection_download", "attempt":attempt});
                    if !matches!(
                        record.status.as_str(),
                        "downloaded" | "ok" | "unrecorded_outcome"
                    ) {
                        record.failure_class = Some(record.status.clone());
                    }
                    record.provenance.push(origin(
                        &from,
                        line,
                        Some(format!("/download_attempts/{i}")),
                        raw,
                    ));
                    rows.push(record.seal(&format!("{from}:{line}:download:{i}"))?);
                }
            }
            catalog.push(json!({"kind":"edge_inspection", "provenance":origin(&from,line,None,raw), "evidence":entry}));
        }
    }
    let android = root.join("android-studio");
    if android.is_dir() {
        for path in paths(&android)? {
            let input = read(&path)?;
            let entry: Value = serde_json::from_str(&input)?;
            let from = label(&path, scanner, "scanner");
            let mut record = app(&entry);
            properties(&mut record, &entry["fixed"]);
            record.settings.profile = Some("local".into());
            record.first_512_hex = string(&entry, "magic");
            record.container_summary = entry.get("volume").cloned();
            record.status =
                string(&entry["fixed"], "status").unwrap_or_else(|| "unrecorded_outcome".into());
            record.evidence = json!({"download":entry["curl"],"listing_error":entry["list_error"],
                "matches":entry["matches"]});
            record.provenance.push(origin(
                &from,
                input
                    .lines()
                    .position(|l| l.contains("\"fixed\""))
                    .map_or(1, |i| i + 1),
                Some("/fixed".into()),
                &input,
            ));
            rows.push(record.seal(&from)?);
        }
    }
    Ok(())
}

fn declarations(scanner: &Path, files: &[PathBuf], catalog: &mut Vec<Value>) -> Result<()> {
    for path in files {
        let from = label(path, scanner, "scanner");
        let input = read(path)?;
        for field in ["entries", "excluded_downloads"] {
            for (i, (item, line, raw)) in array(&input, field)?.into_iter().enumerate() {
                catalog.push(json!({"kind":if field == "entries" {"catalog_entry"} else {"catalog_exclusion"},
                    "provenance":origin(&from, line, Some(format!("/{field}/{i}")), raw), "evidence":item}));
            }
        }
    }
    for (file, title) in [
        ("CLIMB.md", "Remaining regression cases"),
        ("EDGE.md", "Remaining cases"),
    ] {
        let input = read(&scanner.join(file))?;
        let from = format!("scanner/{file}");
        let mut take = false;
        for (i, line) in input.lines().enumerate() {
            if line.starts_with("## ") {
                take = line == format!("## {title}");
            } else if take
                && (line.starts_with("- ") || line.starts_with("| "))
                && !line.starts_with("| ---")
            {
                catalog.push(json!({"kind":"unresolved", "provenance":origin(&from, i+1, None, line), "text":line}));
            }
        }
    }
    Ok(())
}

pub(super) fn all(store: &Store, scanner: &Path, data: &Path) -> Result<()> {
    let mut rows = Vec::new();
    let mut catalog = Vec::new();
    let root = scanner.join("results");
    for path in paths(&root.join("climb"))? {
        let checkpoint = path.join("checkpoint.ndjson");
        if checkpoint.is_file() {
            scan_run(&checkpoint, scanner, &mut rows)?;
        }
    }
    for path in paths(&root.join("edge"))? {
        let run = path.join("run.json");
        if run.is_file() {
            scan_run(&run, scanner, &mut rows)?;
        }
    }
    for path in [
        root.join("homebrew-run-1.json"),
        root.join("homebrew-edge-sample.json"),
    ] {
        scan_run(&path, scanner, &mut rows)?;
    }
    inspections(scanner, &mut rows, &mut catalog)?;
    let casks = data.join("homebrew-scans/casks.jsonl");
    let from = label(&casks, data, "doesitarm-data");
    let mut homebrew_projections = Vec::new();
    for item in jsonl(&read(&casks)?) {
        let (entry, line, raw) = item?;
        for (i, version) in std::iter::once(&entry)
            .chain(entry["representations"].as_array().into_iter().flatten())
            .enumerate()
        {
            let from = origin(
                &from,
                line,
                (i > 0).then(|| format!("/representations/{}", i - 1)),
                raw,
            );
            homebrew_projections.push(projection(version, &Value::Null, from, i)?);
        }
    }
    // Match the published Homebrew projection to its original attempt when
    // byte counters, scanner revision and URL identify exactly one candidate.
    for projection in homebrew_projections {
        let candidates: Vec<_> = rows
            .iter_mut()
            .filter(|row| {
                row.source == projection.source
                    && row.token == projection.token
                    && row.original_url == projection.original_url
                    && row.scanner_commit == projection.scanner_commit
                    && row.bytes_read == projection.bytes_read
                    && row.reads == projection.reads
                    && (row.bytes_read.is_some() || row.scanned_at == projection.scanned_at)
                    && (success(&row.status) == success(&projection.status)
                        || projection
                            .result
                            .as_ref()
                            .is_some_and(|v| v["evidence_scope"] == "bootstrapper"))
                    && (row.error == projection.error
                        || row.error.is_none()
                        || projection
                            .result
                            .as_ref()
                            .is_some_and(|v| v["evidence_scope"] == "bootstrapper"))
            })
            .collect();
        if candidates.len() == 1 {
            let row = candidates.into_iter().next().unwrap();
            row.provenance.extend(projection.provenance);
            if let Some(result) = projection.result {
                row.evidence["cask_export"] = json!({"name":result["name"],"status":result["status"],
                    "native_apple_silicon":result["native_apple_silicon"],"evidence_scope":result["evidence_scope"]});
            }
        } else {
            rows.push(projection);
        }
    }
    source_pilot(
        &data.join("app-sources/runs"),
        data,
        &mut rows,
        &mut catalog,
    )?;
    let mut files = paths(&scanner.join("corpus"))?;
    files.extend([
        scanner.join(MANIFEST),
        root.join("edge/previously-failing-tail/manifest.json"),
    ]);
    declarations(scanner, &files, &mut catalog)?;
    catalog.iter_mut().for_each(privacy::value);
    store.write_lines("catalog.jsonl", &catalog)?;
    let rows = store.merge(rows)?;
    println!(
        "{} attempt records, {} catalog evidence rows",
        rows.len(),
        catalog.len()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn climb_records_each_tier_with_original_row_and_full_output() {
        let fixture = r#"{
  "artifacts": [
    {"cask":"demo","url":"https://x.invalid/demo.zip?token=credential","attempts":[
      {"budget":8388608,"category":"budget_hit","scan":{"status":"budget_exhausted","error":"byte budget reached"}},
      {"budget":67108864,"category":"verified","target":{"kind":"bundle","path":"Demo.app"},"scan":{"status":"complete","inventory":{"binary_count":2}}}
    ]}
  ]
}"#;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("run.json");
        fs::write(&path, fixture).unwrap();
        let mut rows = Vec::new();
        scan_run(&path, dir.path(), &mut rows).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].provenance[0].original_line, 3);
        assert_eq!(
            rows[1].provenance[0].locator.as_deref(),
            Some("/artifacts/0/attempts/1")
        );
        assert_eq!(rows[0].failure_class.as_deref(), Some("budget_hit"));
        assert_eq!(
            rows[1].result.as_ref().unwrap()["inventory"]["binary_count"],
            2
        );
        assert!(rows[0].url_redacted);
        assert!(rows[0].repro.is_none());
        assert_ne!(rows[0].ledger_id, rows[1].ledger_id);
        assert!(!serde_json::to_string(&rows).unwrap().contains("credential"));
    }

    #[test]
    fn source_pilot_keeps_probe_and_observational_tier_history() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("checkpoint.jsonl");
        let fixture = json!({
            "result": {"source":"sparkle-appcasts","status":"unscannable","token":"demo",
                "url":"https://x.invalid/demo.pkg","scanned_at":"2026-11-24T08:00:00Z",
                "budget_attempts":[8388608,67108864], "probe":{"status":206,"content_length":1}},
            "failure": {"stage":"scan","failure_class":"budget_hit","message":"byte budget reached",
                "evidence":{"headers":{"last-modified":"Thu, 26 Nov 2026 08:00:00 GMT"},"first_bytes_hex":"78617221"}}
        });
        fs::write(&file, format!("{fixture}\n")).unwrap();
        let (mut rows, mut catalog) = (vec![], vec![]);
        source_pilot(&file, dir.path(), &mut rows, &mut catalog).unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows[0].failure_class.is_none());
        assert_eq!(rows[0].status, "unrecorded_outcome");
        assert_eq!(rows[1].http_status, Some(206));
        assert_eq!(rows[1].first_512_hex.as_deref(), Some("78617221"));
        assert_eq!(rows[1].headers["content-length"], "1");
        assert_eq!(rows[1].settings.tier_bytes, Some(67_108_864));
        assert_eq!(rows[1].provenance[0].original_line, 1);
    }
}

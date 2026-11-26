mod emit;
mod reduce;
mod trace;

use super::{
    Result,
    capture::{self, Capture},
    import, live, option, privacy,
    store::{Record, Settings, Store},
};
use crate::{Deadline, Output, http};
use flate2::Compression;
use scan_core::{Profile, REMOTE_BUDGET_TIERS, Status};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    env,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};
use trace::Trace;

pub(crate) const USAGE: &str = "Usage: scan-cli shim record <url|file|ledger-kit-dir> [--out TRACE]
       scan-cli shim replay <TRACE|->
       scan-cli shim reduce TRACE [--out TRACE] [--attempts N]
       scan-cli shim emit TRACE --out TEST.rs [--blob]
       scan-cli shim add URL [--root LEDGER_DIR]
Record/add options: --profile local|remote-cli|worker --budget BYTES --decoded-budget BYTES
                    --deadline-ms MS --bundle-path PATH | --binary-path PATH
                    --allow-http --allow-stream";

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
struct Signature {
    status: String,
    format: Option<String>,
    bundle_kind: Option<String>,
    architectures: Vec<Slice>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    candidate_architectures: Vec<Vec<Slice>>,
    #[serde(default)]
    nested_artifacts: usize,
    #[serde(default)]
    installer_metadata: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize, Eq, PartialEq, Serialize)]
struct Slice {
    name: String,
    cpu_type: u32,
    cpu_subtype: u32,
    header_verified: bool,
}

impl From<&scan_core::Architecture> for Slice {
    fn from(arch: &scan_core::Architecture) -> Self {
        Self {
            name: arch.name.into(),
            cpu_type: arch.cpu_type,
            cpu_subtype: arch.cpu_subtype,
            header_verified: arch.header_verified,
        }
    }
}

impl Signature {
    fn from_output(output: &Output) -> Result<Self> {
        let scan = &output.scan;
        Ok(Self {
            status: serde_json::to_value(scan.status)?
                .as_str()
                .ok_or("Scanner returned a non-string status")?
                .to_owned(),
            format: scan.format.map(str::to_owned),
            bundle_kind: scan.bundle_kind.map(str::to_owned),
            architectures: scan.architectures.iter().map(Slice::from).collect(),
            candidate_architectures: scan
                .candidate_executables
                .iter()
                .map(|candidate| candidate.architectures.iter().map(Slice::from).collect())
                .collect(),
            nested_artifacts: scan.nested_artifacts.len(),
            installer_metadata: scan.installer.is_some(),
            error: scan.error.as_deref().map(privacy::text),
        })
    }

    fn from_json(output: &Value) -> Result<Self> {
        let mut summary = output.clone();
        summary["candidate_architectures"] = Value::Array(
            output["candidate_executables"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|candidate| candidate["architectures"].clone())
                .collect(),
        );
        summary["nested_artifacts"] =
            json!(output["nested_artifacts"].as_array().map_or(0, Vec::len));
        summary["installer_metadata"] = json!(output["installer"].is_object());
        let mut signature: Self = serde_json::from_value(summary)?;
        signature.error = signature.error.as_deref().map(privacy::text);
        Ok(signature)
    }
}

pub(crate) fn cli() -> ExitCode {
    let args = env::args_os()
        .skip(2)
        .map(|arg| {
            arg.into_string()
                .map_err(|_| "Shim command requires UTF-8 arguments")
        })
        .collect::<std::result::Result<Vec<_>, _>>();
    match args.map_err(Into::into).and_then(run) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", privacy::text(&error.to_string()));
            ExitCode::FAILURE
        }
    }
}

fn run(mut args: Vec<String>) -> Result<()> {
    if args.is_empty() || matches!(args[0].as_str(), "--help" | "-h" | "help") {
        println!("{USAGE}");
        return Ok(());
    }
    let verb = args.remove(0);
    let input = if args.first().is_some_and(|arg| !arg.starts_with("--")) {
        args.remove(0)
    } else {
        return Err(format!("Missing shim input\n{USAGE}").into());
    };
    let path = Path::new(&input);
    match verb.as_str() {
        "record" => {
            let out = option(&mut args, "--out")?.map(PathBuf::from);
            let mut trace = if path.is_dir() {
                no_extra(&args)?;
                Trace::from_kit(path)?
            } else {
                let (settings, decoded_budget) = settings(&mut args, is_url(&input))?;
                no_extra(&args)?;
                let (output, capture, _) = observe(&input, &settings, decoded_budget)?;
                Trace::from_capture(capture, settings, decoded_budget, &output)?
            };
            let out = out.map_or_else(|| default_trace_path("record"), Ok)?;
            let stored = trace.save(&out, Compression::fast())?;
            summary(&trace, stored, &out, None)?;
        }
        "replay" => {
            no_extra(&args)?;
            let trace = Trace::load(path)?;
            trace.verify()?;
            println!("{}", serde_json::to_string_pretty(&trace.header.expected)?);
        }
        "reduce" => {
            let out = option(&mut args, "--out")?.map(PathBuf::from);
            let attempts = option(&mut args, "--attempts")?.map_or(Ok(1024), |v| v.parse())?;
            no_extra(&args)?;
            let mut trace = Trace::load(path)?;
            let attempts = reduce::run(&mut trace, attempts)?;
            let out = out.map_or_else(|| default_trace_path("reduced"), Ok)?;
            let stored = trace.save(&out, Compression::best())?;
            summary(&trace, stored, &out, Some(attempts))?;
        }
        "emit" => {
            let out = option(&mut args, "--out")?.ok_or("shim emit requires --out TEST.rs")?;
            let blob = flag(&mut args, "--blob");
            no_extra(&args)?;
            let mut trace = Trace::load(path)?;
            emit::test(&mut trace, Path::new(&out), blob)?;
            println!("{}", privacy::text(&out));
        }
        "add" if is_url(&input) => {
            let root = option(&mut args, "--root")?.map(PathBuf::from);
            let (settings, decoded_budget) = settings(&mut args, true)?;
            no_extra(&args)?;
            add(&input, root, settings, decoded_budget)?;
        }
        _ => return Err(format!("Unknown shim command or invalid input\n{USAGE}").into()),
    }
    Ok(())
}

fn no_extra(args: &[String]) -> Result<()> {
    if args.is_empty() {
        Ok(())
    } else {
        Err(format!("Unexpected shim arguments\n{USAGE}").into())
    }
}

fn flag(args: &mut Vec<String>, name: &str) -> bool {
    let Some(index) = args.iter().position(|arg| arg == name) else {
        return false;
    };
    args.remove(index);
    true
}

fn is_url(input: &str) -> bool {
    input.starts_with("https://") || input.starts_with("http://")
}

fn settings(args: &mut Vec<String>, remote: bool) -> Result<(Settings, Option<u64>)> {
    let profile = option(args, "--profile")?
        .unwrap_or_else(|| if remote { "remote-cli" } else { "local" }.into());
    let parsed: Profile = profile.parse()?;
    if remote && parsed == Profile::Local {
        return Err("URL recording requires remote-cli or worker profile".into());
    }
    let explicit_budget = option(args, "--budget")?
        .map(|v| v.parse::<u64>())
        .transpose()?;
    let tier_bytes = explicit_budget.or_else(|| {
        if remote {
            Some(REMOTE_BUDGET_TIERS[2])
        } else {
            None
        }
    });
    if remote && tier_bytes.is_some_and(|budget| budget == 0 || budget > REMOTE_BUDGET_TIERS[2]) {
        return Err("URL recording requires a budget between one byte and 256 MiB".into());
    }
    let decoded_budget = option(args, "--decoded-budget")?
        .map(|v| v.parse())
        .transpose()?;
    let deadline_ms = option(args, "--deadline-ms")?
        .map(|v| v.parse::<u64>())
        .transpose()?;
    let deadline_ms = deadline_ms.or_else(|| remote.then_some(45_000));
    let deadline_ms = if parsed == Profile::Worker {
        Some(
            deadline_ms
                .unwrap_or(u64::MAX)
                .min(u64::from(scan_core::WORKER_WALL_TIME_MS)),
        )
    } else {
        deadline_ms
    };
    let bundle = option(args, "--bundle-path")?;
    let binary = option(args, "--binary-path")?;
    let target = match (bundle, binary) {
        (Some(path), None) => Some(json!({"kind":"bundle","path":path})),
        (None, Some(path)) => Some(json!({"kind":"executable","path":path})),
        (None, None) => None,
        _ => return Err("Choose one archive selector".into()),
    };
    let flags = ["--allow-http", "--allow-stream"]
        .into_iter()
        .filter(|name| flag(args, name))
        .map(str::to_owned)
        .collect();
    Ok((
        Settings {
            profile: Some(profile),
            tier_bytes,
            deadline_ms,
            target,
            flags,
            ..Settings::default()
        },
        decoded_budget,
    ))
}

fn home() -> Result<PathBuf> {
    Ok(env::var_os("HOME")
        .ok_or("HOME is required for the shim cache")?
        .into())
}

fn cache() -> Result<PathBuf> {
    let dir = home()?.join(".cache/doesitarm-shims");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn default_trace_path(stage: &str) -> Result<PathBuf> {
    let file = tempfile::Builder::new()
        .prefix(stage)
        .suffix(".shim")
        .tempfile_in(cache()?)?;
    let path = file.path().to_owned();
    file.close()?;
    Ok(path)
}

fn observe(
    input: &str,
    settings: &Settings,
    decoded_budget: Option<u64>,
) -> Result<(Output, Capture, u64)> {
    let mut limits = live::limits(settings)?;
    if let Some(decoded) = decoded_budget {
        limits.decoded_byte_budget = decoded;
    }
    let capture = Capture::shim();
    let target = live::target(settings);
    let has_flag = |name| settings.flags.iter().any(|flag| flag == name);
    let deadline = |start| {
        settings.deadline_ms.map(|ms| Deadline {
            start,
            duration: Duration::from_millis(ms),
        })
    };
    if !is_url(input) {
        return capture::local_with_capture(
            Path::new(input),
            limits,
            target,
            deadline(Instant::now()),
            capture,
        );
    }
    if input.starts_with("http://") && !has_flag("--allow-http") {
        return Err("URL must use HTTPS unless --allow-http is supplied".into());
    }
    let (spool_dir, _lock) = live::network_guard_in(cache()?)?;
    let start = Instant::now();
    let mut capture = capture;
    let result = http::scan_with_capture(
        input,
        limits,
        target,
        &http::Options {
            allow_stream: has_flag("--allow-stream"),
            allow_http: has_flag("--allow-http"),
            spool_dir: Some(spool_dir),
            ..http::Options::default()
        },
        deadline(start),
        Some(&mut capture),
    );
    Ok((result, capture, start.elapsed().as_millis() as u64))
}

fn summary(trace: &Trace, stored: u64, out: &Path, attempts: Option<usize>) -> Result<()> {
    println!(
        "{}",
        json!({
            "trace": privacy::text(&out.to_string_lossy()),
            "original_bytes": trace.original_bytes(),
        "logical_bytes": trace.logical_bytes(),
        "validator_sha256": trace.validator(),
            "payload_bytes": trace.payload.len(),
            "compressed_bytes": stored,
            "attempts": attempts,
            "outcome": trace.header.expected,
        })
    );
    Ok(())
}

fn add(
    url: &str,
    root: Option<PathBuf>,
    settings: Settings,
    decoded_budget: Option<u64>,
) -> Result<()> {
    let root = root.map_or_else(
        || Ok::<_, Box<dyn std::error::Error>>(home()?.join("Code/doesitarm-data/scan-ledger")),
        Ok,
    )?;
    let (output, capture, elapsed) = observe(url, &settings, decoded_budget)?;
    let clean_url = privacy::text(url);
    let rows = Store::open(root.clone())?.records()?;
    let previous = rows
        .iter()
        .filter(|row| row.original_url.as_ref() == Some(&clean_url))
        .max_by_key(|row| row.order());
    let entry = previous.map_or_else(|| json!({
        "url":clean_url, "token":format!("shim-{}", &privacy::sha(clean_url.as_bytes())[..12]),
        "source":"shim",
    }), live::entry_for);
    let raw = serde_json::to_value(&output)?;
    let mut record = import::live_record(&entry, settings.clone(), &raw, elapsed);
    live::enrich(&mut record, &capture)?;
    record.previous_id = previous.map(|row| row.ledger_id.clone());
    record.evidence =
        json!({"artifact":entry, "capture_source":"shim", "decoded_budget":decoded_budget});
    let mut record = record.seal("shim-add")?;

    // Complete scans can still receive a ledger classification such as
    // metadata_missing. Keep that evidence and allow a replay for it.
    let draft = if record.failure_class.is_some() || !matches!(output.scan.status, Status::Complete)
    {
        draft(&mut record, capture, settings, decoded_budget, &output)
    } else {
        Ok(())
    };
    if let Err(error) = &draft {
        record.evidence["shim_error"] = json!(privacy::text(&error.to_string()));
    }
    let store = Store::open(root)?;
    store.append(&record)?;
    store.update_latest(&store.records()?)?;
    println!("{} {}", record.ledger_id, record.status);
    draft
}

fn draft(
    record: &mut Record,
    capture: Capture,
    settings: Settings,
    decoded_budget: Option<u64>,
    output: &Output,
) -> Result<()> {
    let mut trace = Trace::from_capture(capture, settings, decoded_budget, output)?;
    let attempts = reduce::run(&mut trace, 512)?;
    let dir = cache()?.join(&record.ledger_id);
    std::fs::create_dir(&dir)?;
    let path = dir.join("reduced.shim");
    let stored = trace.save(&path, Compression::best())?;
    record.evidence["shim"] = json!({
        "cache_key":record.ledger_id,
        "compressed_bytes":stored,
        "payload_bytes":trace.payload.len(),
    });
    summary(&trace, stored, &path, Some(attempts))?;
    if stored < emit::LIMIT {
        emit::test(&mut trace, &dir.join("shim_replay.rs"), false)?;
    }
    Ok(())
}

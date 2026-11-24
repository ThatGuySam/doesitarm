#![forbid(unsafe_code)]

mod http;
mod local_folder;

use scan_core::{
    Profile, REMOTE_BUDGET_TIERS, ReadAt, Result, ScanError, ScanLimits, ScanResult, Status,
    Target, WORKER_WALL_TIME_MS, scan_target_with_deadline,
};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs::File,
    future::Future,
    io::{Read, Seek, SeekFrom},
    path::Path,
    pin::pin,
    process::ExitCode,
    task::{Context, Poll, Waker},
    time::{Duration, Instant},
};

const USAGE: &str = "Usage: scan-cli scan <path-or-url> [--profile local|remote-cli|worker] [--budget BYTES] [--deadline-ms MS] [--decoded-budget BYTES] [--json] [--allow-stream] [--allow-http] [--request-delay-ms MS] [--bundle-path PATH | --binary-path PATH]";

struct Args {
    input: OsString,
    limits: ScanLimits,
    escalate: bool,
    deadline: Option<Duration>,
    json: bool,
    http: http::Options,
    target: Option<Requested>,
}

#[derive(Clone, Copy)]
struct Deadline {
    start: Instant,
    duration: Duration,
}

impl Deadline {
    fn remaining(self) -> Duration {
        self.duration.saturating_sub(self.start.elapsed())
    }

    fn expired(self) -> bool {
        self.remaining().is_zero()
    }
}

enum Requested {
    Bundle(String),
    Executable(String),
}

fn path_argument(value: Option<OsString>) -> std::result::Result<String, &'static str> {
    value
        .and_then(|value| value.into_string().ok())
        .filter(|value| !value.is_empty())
        .ok_or("Expected a nonempty UTF-8 archive path.")
}

#[derive(Serialize)]
struct Output {
    #[serde(flatten)]
    scan: ScanResult,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_etag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_transport: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_content_type: Option<String>,
}

impl Output {
    fn new(scan: ScanResult) -> Self {
        Self {
            scan,
            source_etag: None,
            source_transport: None,
            source_content_type: None,
        }
    }
}

fn main() -> ExitCode {
    let args = match args() {
        Ok(Some(args)) => args,
        Ok(None) => {
            println!("{USAGE}");
            println!("Local files default to local with no work budget or deadline.");
            println!(
                "Local .app directories scan one bundle. Other directories scan recursively; --json emits a JSON array."
            );
            println!("URL attempts default to remote-cli with 8, 64, and 256 MiB tiers.");
            println!(
                "Worker defaults: {} bytes requested, {} bytes decoded, {} ms wall time.",
                REMOTE_BUDGET_TIERS[0],
                scan_core::DEFAULT_DECODED_BYTE_BUDGET,
                WORKER_WALL_TIME_MS,
            );
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            eprintln!("{error}\n{USAGE}");
            return ExitCode::from(2);
        }
    };

    let path = Path::new(&args.input);
    if args.limits.profile == Profile::Local && args.target.is_none() && path.is_dir() {
        return match local_folder::report(path, args.json, args.deadline) {
            Ok(complete) if complete => ExitCode::SUCCESS,
            Ok(_) => ExitCode::FAILURE,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }

    let output = run(&args);
    let result = &output.scan;
    if args.json {
        match serde_json::to_string_pretty(&output) {
            Ok(text) => println!("{text}"),
            Err(error) => {
                eprintln!("Could not write JSON: {error}");
                return ExitCode::FAILURE;
            }
        }
    } else {
        let arch: Vec<_> = result
            .architectures
            .iter()
            .map(|value| value.name)
            .collect();
        let label = result
            .name
            .as_deref()
            .or(result.bundle_id.as_deref())
            .unwrap_or("Input");
        println!(
            "{label} ({}) — {}",
            result.format.unwrap_or("unknown"),
            arch.join(", ")
        );
        println!(
            "{} of {} unique bytes read, {} bytes requested across {} reads, {} decoded bytes",
            result.bytes_read,
            result.total_size,
            result.bytes_requested,
            result.reads,
            result.decoded_bytes
        );
        if let Some(error) = &result.error {
            eprintln!("{error}");
        }
    }
    if matches!(result.status, Status::Complete) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn args() -> std::result::Result<Option<Args>, &'static str> {
    let mut values = std::env::args_os().skip(1);
    let command = values.next();
    if command
        .as_deref()
        .and_then(|value| value.to_str())
        .is_some_and(|s| matches!(s, "--help" | "-h"))
    {
        return Ok(None);
    }
    if command.as_deref().and_then(|value| value.to_str()) != Some("scan") {
        return Err("Expected the scan command.");
    }
    let input = values.next().ok_or("Missing path or HTTPS URL.")?;
    let mut budget = None;
    let mut profile = None;
    let mut deadline = None;
    let mut decoded_budget = None;
    let mut json = false;
    let mut http = http::Options::default();
    let mut delay = None;
    let mut target = None;
    while let Some(value) = values.next() {
        match value.to_str() {
            Some("--profile") if profile.is_none() => {
                profile = Some(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse::<Profile>().ok())
                        .ok_or("Expected a profile of local, remote-cli, or worker.")?,
                );
            }
            Some("--deadline-ms") if deadline.is_none() => {
                deadline = Some(Duration::from_millis(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse().ok())
                        .ok_or("Expected a nonnegative integer deadline in milliseconds.")?,
                ));
            }
            Some("--budget") if budget.is_none() => {
                budget = Some(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse().ok())
                        .ok_or("Expected a nonnegative integer byte budget.")?,
                );
            }
            Some("--decoded-budget") if decoded_budget.is_none() => {
                decoded_budget = Some(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse().ok())
                        .ok_or("Expected a nonnegative integer decoded-byte budget.")?,
                );
            }
            Some("--json") if !json => json = true,
            Some("--bundle-path") if target.is_none() => {
                target = Some(Requested::Bundle(path_argument(values.next())?));
            }
            Some("--binary-path") if target.is_none() => {
                target = Some(Requested::Executable(path_argument(values.next())?));
            }
            Some("--allow-stream") if !http.allow_stream => http.allow_stream = true,
            Some("--allow-http") if !http.allow_http => http.allow_http = true,
            Some("--request-delay-ms") if delay.is_none() => {
                delay = Some(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse::<u64>().ok())
                        .filter(|value| *value <= 60_000)
                        .ok_or("Expected a request delay of 0 to 60000 milliseconds.")?,
                );
            }
            _ => return Err("Unknown or repeated flag."),
        }
    }
    let url = input.to_str().is_some_and(|text| text.contains("://"));
    let profile = profile.unwrap_or(if url {
        Profile::RemoteCli
    } else {
        Profile::Local
    });
    if url && profile == Profile::Local {
        return Err("URL scans require remote-cli or worker.");
    }
    let mut limits = ScanLimits::for_profile(profile);
    if let Some(budget) = budget {
        limits.byte_budget = budget;
    }
    if let Some(decoded_budget) = decoded_budget {
        limits.decoded_byte_budget = decoded_budget;
    }
    if profile == Profile::Worker {
        let worker_deadline = Duration::from_millis(WORKER_WALL_TIME_MS.into());
        deadline = Some(deadline.map_or(worker_deadline, |explicit| explicit.min(worker_deadline)));
    }
    http.delay = Duration::from_millis(delay.unwrap_or(0));
    Ok(Some(Args {
        input,
        limits,
        escalate: url && profile == Profile::RemoteCli && budget.is_none(),
        deadline,
        json,
        http,
        target,
    }))
}

fn run(args: &Args) -> Output {
    let deadline = args.deadline.map(|duration| Deadline {
        start: Instant::now(),
        duration,
    });
    let target = match &args.target {
        Some(Requested::Bundle(path)) => Target::Bundle(path),
        Some(Requested::Executable(path)) => Target::Executable(path),
        None => Target::Auto,
    };
    let source = args.input.to_str();
    let result = if let Some(url) = source.filter(|s| s.contains("://")) {
        if url.starts_with("https://") || (args.http.allow_http && url.starts_with("http://")) {
            let mut limits = args.limits;
            let mut result = http::scan(url, limits, target, &args.http, deadline);
            if args.escalate {
                for budget in REMOTE_BUDGET_TIERS.into_iter().skip(1) {
                    if !matches!(result.scan.status, Status::BudgetExhausted) {
                        break;
                    }
                    limits.byte_budget = budget;
                    result = http::scan(url, limits, target, &args.http, deadline);
                }
            }
            return result;
        }
        Err(ScanError::Source("URL must use HTTPS".into()))
    } else {
        FileSource::open(Path::new(&args.input)).map(|mut file| {
            let expired = || deadline.is_some_and(Deadline::expired);
            ready(scan_target_with_deadline(
                &mut file,
                args.limits,
                target,
                deadline.map(|_| &expired as &dyn Fn() -> bool),
            ))
        })
    };
    Output::new(result.unwrap_or_else(|error| failure(error, 0)))
}

fn failure(error: ScanError, reads: u64) -> ScanResult {
    let mut scan = ScanResult::new(0);
    scan.reads = reads;
    scan.set_error(error);
    scan
}

struct FileSource {
    file: File,
    size: u64,
}

impl FileSource {
    fn open(path: &Path) -> Result<Self> {
        let file = File::open(path).map_err(source_error)?;
        let meta = file.metadata().map_err(source_error)?;
        if !meta.is_file() {
            return Err(ScanError::Source(
                "local path must be a regular file".into(),
            ));
        }
        Ok(Self {
            file,
            size: meta.len(),
        })
    }
}

impl ReadAt for FileSource {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let mut data = vec![0; len];
        self.file
            .seek(SeekFrom::Start(offset))
            .map_err(source_error)?;
        self.file.read_exact(&mut data).map_err(source_error)?;
        Ok(data)
    }
}

fn source_error(err: impl std::fmt::Display) -> ScanError {
    ScanError::Source(err.to_string())
}

fn ready<T>(future: impl Future<Output = T>) -> T {
    match pin!(future).poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(value) => value,
        Poll::Pending => unreachable!("CLI source uses blocking reads"),
    }
}

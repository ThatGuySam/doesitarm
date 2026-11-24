#![forbid(unsafe_code)]

mod http;

use scan_core::{ReadAt, Result, ScanError, ScanResult, Status, Target, scan_target};
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
    time::Duration,
};

const DEFAULT_BUDGET: u64 = 64 * 1024 * 1024;
const USAGE: &str = "Usage: scan-cli scan <path-or-url> [--budget BYTES] [--json] [--allow-stream] [--allow-http] [--request-delay-ms MS] [--bundle-path PATH | --binary-path PATH]";

struct Args {
    input: OsString,
    budget: u64,
    json: bool,
    http: http::Options,
    target: Option<Requested>,
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
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            eprintln!("{error}\n{USAGE}");
            return ExitCode::from(2);
        }
    };

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
            "{} of {} bytes in {} reads",
            result.bytes_read, result.total_size, result.reads
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
    let mut json = false;
    let mut http = http::Options::default();
    let mut delay = None;
    let mut target = None;
    while let Some(value) = values.next() {
        match value.to_str() {
            Some("--budget") if budget.is_none() => {
                budget = Some(
                    values
                        .next()
                        .and_then(|value| value.to_str()?.parse().ok())
                        .ok_or("Expected a nonnegative integer byte budget.")?,
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
    http.delay = Duration::from_millis(delay.unwrap_or(0));
    Ok(Some(Args {
        input,
        budget: budget.unwrap_or(DEFAULT_BUDGET),
        json,
        http,
        target,
    }))
}

fn run(args: &Args) -> Output {
    let target = match &args.target {
        Some(Requested::Bundle(path)) => Target::Bundle(path),
        Some(Requested::Executable(path)) => Target::Executable(path),
        None => Target::Auto,
    };
    let source = args.input.to_str();
    let result = if let Some(url) = source.filter(|s| s.contains("://")) {
        if url.starts_with("https://") || (args.http.allow_http && url.starts_with("http://")) {
            return http::scan(url, args.budget, target, &args.http);
        }
        Err(ScanError::Source("URL must use HTTPS".into()))
    } else {
        FileSource::open(Path::new(&args.input))
            .map(|mut file| ready(scan_target(&mut file, args.budget, target)))
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

use clap::{Parser, Subcommand};
use source_tools::{
    AnyResult,
    artifact::{ScanOptions, Tier},
    connectors::ConnectorId,
    http::Http,
    pipeline::{self, Run},
    triage,
};
use std::{
    path::PathBuf,
    process::ExitCode,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

#[derive(Parser)]
#[command(about = "Discover and range-scan public macOS app releases")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Discover from public repo or feed seeds, or import version-pinned URLs.
    Run {
        #[arg(long, value_enum)]
        connector: ConnectorId,
        /// Newline-delimited URLs, GitHub owner/repo seeds, or JSONL Seed records.
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u32).range(1..=1_000_000))]
        limit: u32,
        /// Use URLs as already resolved, as in a pinned research manifest.
        #[arg(long)]
        pinned: bool,
        /// Permit the scanner to read useful ranges after the one-byte probe.
        #[arg(long)]
        scan_ranges: bool,
        #[arg(long, value_enum, default_value = "256")]
        max_tier: Tier,
        #[arg(long, default_value_t = 120, value_parser = clap::value_parser!(u64).range(1..=3600))]
        timeout_secs: u64,
        /// Directory for conditional metadata cache entries. Defaults to the user cache directory.
        #[arg(long)]
        cache: Option<PathBuf>,
        /// Use recorded responses instead of making network requests.
        #[arg(long, conflicts_with = "cache")]
        fixture: Option<PathBuf>,
    },
    /// Generate a replayable task per recorded failure class.
    Triage {
        #[arg(long)]
        dir: PathBuf,
    },
    /// Replay one sample and require fresh evidence of success.
    Verify {
        #[arg(long)]
        task: PathBuf,
        #[arg(long, default_value_t = 1, value_parser = clap::value_parser!(u32).range(1..=3))]
        sample: u32,
        /// Replay offline against a bounded fixture.
        #[arg(long)]
        fixture: Option<PathBuf>,
        /// Require a reproduction of the original class instead of a fix.
        #[arg(long, requires = "fixture")]
        expect_failure: bool,
    },
    /// Print the Linux seccomp filter used by the offline healing runner.
    #[cfg(target_os = "linux")]
    #[command(hide = true)]
    HealFilter,
    /// Close ambient descriptors and run the OS sandbox.
    #[cfg(target_os = "linux")]
    #[command(hide = true)]
    HealSandbox {
        #[arg(trailing_var_arg = true, required = true, allow_hyphen_values = true)]
        args: Vec<std::ffi::OsString>,
    },
}

#[cfg(target_os = "linux")]
mod sandbox;

fn main() -> ExitCode {
    match execute(Cli::parse().command) {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("sources: {error}");
            ExitCode::from(2)
        }
    }
}

fn execute(command: Command) -> AnyResult<u8> {
    match command {
        Command::Run {
            connector,
            input,
            out,
            limit,
            pinned,
            scan_ranges,
            max_tier,
            timeout_secs,
            cache,
            fixture,
        } => {
            let cache = fixture
                .is_none()
                .then(|| cache.unwrap_or_else(default_cache));
            let config = Run {
                connector,
                input,
                out,
                pinned,
                limit: limit as usize,
                cache,
                options: ScanOptions {
                    scan_ranges,
                    max_tier,
                    timeout_secs,
                },
            };
            let summary = if let Some(path) = fixture {
                pipeline::run(&config, &triage::Fixture::open(&path)?, || 0)?
            } else {
                let transport = Http::new(cancellation()?, token());
                pipeline::run(&config, &transport, || transport.robots_bytes())?
            };
            println!("{}", serde_json::to_string_pretty(&summary)?);
            Ok(if summary.cancelled { 130 } else { 0 })
        }
        Command::Triage { dir } => {
            println!("Wrote {} failure-class tasks.", triage::triage(&dir)?);
            Ok(0)
        }
        Command::Verify {
            task,
            sample,
            fixture,
            expect_failure,
        } => {
            let result = if let Some(fixture) = fixture {
                triage::fixture_result(&task, sample as usize, &fixture)?
            } else {
                let transport = Http::new(cancellation()?, token());
                triage::verify(&task, sample as usize, &transport)?
            };
            let success = if expect_failure {
                result.baseline_reproduced
            } else {
                result.fixed
            };
            println!("{}", serde_json::to_string_pretty(&result)?);
            Ok(u8::from(!success))
        }
        #[cfg(target_os = "linux")]
        Command::HealFilter => {
            sandbox::print_filter()?;
            Ok(0)
        }
        #[cfg(target_os = "linux")]
        Command::HealSandbox { args } => Err(sandbox::exec(args).into()),
    }
}

fn default_cache() -> PathBuf {
    std::env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
        .unwrap_or_else(std::env::temp_dir)
        .join("doesitarm-source-tools")
}

fn token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .filter(|token| !token.is_empty())
}

static INTERRUPTED: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
extern "C" fn interrupt(_: libc::c_int) {
    INTERRUPTED.store(true, Ordering::Relaxed);
}

fn cancellation() -> AnyResult<Arc<AtomicBool>> {
    #[cfg(unix)]
    {
        // The persistent handlers only write to an atomic flag.
        // SAFETY: interrupt has C ABI and does not call non-signal-safe APIs.
        unsafe {
            for signal in [libc::SIGINT, libc::SIGTERM] {
                if libc::signal(signal, interrupt as *const () as libc::sighandler_t)
                    == libc::SIG_ERR
                {
                    return Err(std::io::Error::last_os_error().into());
                }
            }
        }
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    let flag = Arc::downgrade(&cancelled);
    thread::spawn(move || {
        while let Some(flag) = flag.upgrade() {
            if INTERRUPTED.load(Ordering::Relaxed) {
                flag.store(true, Ordering::Relaxed);
                break;
            }
            drop(flag);
            thread::sleep(Duration::from_millis(25));
        }
    });
    Ok(cancelled)
}

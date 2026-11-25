pub(crate) mod capture;
mod classify;
mod import;
mod live;
mod privacy;
mod store;

use std::{
    env,
    error::Error,
    path::{Path, PathBuf},
    process::ExitCode,
};

type Result<T> = std::result::Result<T, Box<dyn Error>>;

const USAGE: &str = "Usage: scan-cli ledger [--root DIR] import [--scanner DIR] [--data DIR]
       scan-cli ledger [--root DIR] resume [--scanner DIR] [--limit N] [--seconds N]
       scan-cli ledger [--root DIR] rerun <id|class|--all-failures> [--limit N]
       scan-cli ledger [--root DIR] report
       scan-cli ledger [--root DIR] kit <id> --out DIR [--input FILE]
       scan-cli ledger replay DIR
       scan-cli ledger [--root DIR] show <id>
       scan-cli ledger [--root DIR] history [URL]
       scan-cli ledger [--root DIR] latest";

pub(crate) fn cli() -> ExitCode {
    let args = env::args_os()
        .skip(2)
        .map(|arg| {
            arg.into_string()
                .map_err(|_| "Ledger command requires UTF-8 arguments")
        })
        .collect::<std::result::Result<Vec<_>, _>>();
    match args.map_err(Into::into).and_then(|args| run(args)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", privacy::text(&error.to_string()));
            ExitCode::FAILURE
        }
    }
}

fn option(args: &mut Vec<String>, name: &str) -> Result<Option<String>> {
    let Some(i) = args.iter().position(|arg| arg == name) else {
        return Ok(None);
    };
    if i + 1 >= args.len() || args[i + 1].starts_with("--") {
        return Err(format!("Missing value for {name}").into());
    }
    args.remove(i);
    Ok(Some(args.remove(i)))
}

fn require_empty(args: &[String]) -> Result<()> {
    if args.is_empty() {
        Ok(())
    } else {
        Err("Unexpected ledger arguments. See scan-cli ledger --help".into())
    }
}

fn scanner_root() -> Result<PathBuf> {
    let cwd = env::current_dir()?;
    if cwd.join(import::MANIFEST).is_file() {
        return Ok(cwd);
    }
    let candidate = cwd.join("scanner");
    if candidate.join(import::MANIFEST).is_file() {
        return Ok(candidate);
    }
    let compiled = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    Ok(compiled.to_path_buf())
}

fn run(mut args: Vec<String>) -> Result<()> {
    let root = option(&mut args, "--root")?.map(PathBuf::from);
    let Some(command) = args.first().cloned() else {
        println!("{USAGE}");
        return Ok(());
    };
    args.remove(0);
    if matches!(command.as_str(), "--help" | "-h" | "help") {
        println!("{USAGE}");
        return Ok(());
    }
    let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let data = option(&mut args, "--data")?
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("Code/doesitarm-data"));
    let root = root.unwrap_or_else(|| data.join("scan-ledger"));
    let scanner = option(&mut args, "--scanner")?.map(PathBuf::from);
    let limit = option(&mut args, "--limit")?
        .map(|n| n.parse::<usize>())
        .transpose()?;
    match command.as_str() {
        "import" => {
            require_empty(&args)?;
            import::all(
                &store::Store::open(root)?,
                &scanner.map_or_else(scanner_root, Ok)?,
                &data,
            )
        }
        "resume" => {
            let seconds = option(&mut args, "--seconds")?
                .map(|n| n.parse::<u64>())
                .transpose()?
                .unwrap_or(3600);
            require_empty(&args)?;
            live::continue_catalog(
                &root,
                &scanner.map_or_else(scanner_root, Ok)?,
                limit.unwrap_or(400),
                seconds,
            )
        }
        "rerun" if args.len() == 1 => live::rerun(&root, &args[0], limit.unwrap_or(usize::MAX)),
        "report" if args.is_empty() => {
            let store = store::Store::open(root)?;
            report::write(&store, &scanner.map_or_else(scanner_root, Ok)?)
        }
        "kit" => {
            let out = option(&mut args, "--out")?.ok_or("Missing --out DIR")?;
            let input = option(&mut args, "--input")?.map(PathBuf::from);
            if args.len() != 1 {
                return Err("Expected one attempt ID".into());
            }
            kit::create(&root, &args[0], Path::new(&out), input.as_deref())
        }
        "replay" if args.len() == 1 => kit::inspect(Path::new(&args[0])),
        "show" if args.len() == 1 => {
            let store = store::Store::open(root)?;
            let rows = store.records()?;
            let row = rows
                .iter()
                .find(|row| row.ledger_id == args[0])
                .ok_or("Unknown ledger ID")?;
            println!("{}", serde_json::to_string_pretty(row)?);
            Ok(())
        }
        "history" if args.len() <= 1 => {
            let store = store::Store::open(root)?;
            let mut rows = store.records()?;
            rows.sort_by(|a, b| a.order().cmp(&b.order()));
            let filter = args.first().map(|url| privacy::text(url));
            for row in rows.iter().filter(|row| {
                filter
                    .as_ref()
                    .is_none_or(|url| row.original_url.as_ref() == Some(url))
            }) {
                println!("{}", serde_json::to_string(row)?);
            }
            Ok(())
        }
        "latest" if args.is_empty() => {
            let store = store::Store::open(root)?;
            let rows = store.records()?;
            for row in store::latest(&rows).into_values() {
                println!("{}", serde_json::to_string(row)?);
            }
            Ok(())
        }
        _ => Err(format!("Unknown command or arguments.\n{USAGE}").into()),
    }
}

mod kit;
mod report;

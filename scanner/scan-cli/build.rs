use std::{path::PathBuf, process::Command};

fn main() {
    let git = |args: &[&str]| {
        let result = Command::new("git").args(args).output().ok()?;
        result
            .status
            .success()
            .then(|| String::from_utf8_lossy(&result.stdout).trim().to_owned())
    };
    if let Some(head) = git(&["rev-parse", "--git-path", "HEAD"]) {
        println!("cargo:rerun-if-changed={head}");
    }
    if let Some(reference) = git(&["symbolic-ref", "-q", "HEAD"])
        .and_then(|reference| git(&["rev-parse", "--git-path", &reference]))
        .map(PathBuf::from)
        .filter(|path| path.exists())
    {
        println!("cargo:rerun-if-changed={}", reference.display());
    }
    let commit = git(&["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".to_owned());
    println!("cargo:rustc-env=SCAN_CLI_COMMIT={commit}");
}

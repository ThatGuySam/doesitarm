use serde_json::{Value, json};
use source_tools::{
    artifact::{ScanOptions, Tier},
    connectors::ConnectorId,
    pipeline::{self, Run},
    triage::{self, Fixture},
};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

fn fixture_path(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

fn lines(path: &Path) -> Vec<Value> {
    fs::read_to_string(path)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[test]
fn records_failures_and_duplicate_precedence_and_resumes_after_a_torn_line() {
    let scratch = tempfile::tempdir().unwrap();
    let input = scratch.path().join("inputs.jsonl");
    let output = scratch.path().join("out");
    let fixture = Fixture::open(&fixture_path("range-errors.json")).unwrap();
    let rows = [
        json!({"name":"Moved", "url":"https://downloads.example.org/moved.dmg", "bundle_id":"org.example.app"}),
        json!({"name":"Same URL", "url":"https://downloads.example.org/moved.dmg?utm_source=newsletter#download"}),
        json!({"name":"Same Bundle", "url":"https://other.example.org/archive.zip", "bundle_id":"ORG.EXAMPLE.APP"}),
        json!({"name":"Moved", "url":"https://downloads.example.org/alt.dmg"}),
        json!({"name":"Landing page", "url":"https://downloads.example.org/page"}),
        json!({"name":"No ranges", "url":"https://downloads.example.org/ignore.zip"}),
    ];
    fs::write(&input, rows.map(|row| format!("{row}\n")).concat()).unwrap();
    let mut run = Run {
        connector: ConnectorId::UrlList,
        input,
        out: output.clone(),
        cache: None,
        pinned: false,
        limit: 2,
        options: ScanOptions::default(),
    };
    let summary = pipeline::run(&run, &fixture, || 0).unwrap();
    assert_eq!(
        (summary.discovered, summary.failed, summary.duplicate),
        (2, 1, 1)
    );
    let mut checkpoint = OpenOptions::new()
        .append(true)
        .open(output.join("checkpoint.jsonl"))
        .unwrap();
    checkpoint.write_all(b"{\"\"torn").unwrap();

    run.limit = 6;
    let summary = pipeline::run(&run, &fixture, || 0).unwrap();
    assert_eq!(
        (
            summary.discovered,
            summary.duplicate,
            summary.reachable,
            summary.scanned,
            summary.failed
        ),
        (6, 3, 1, 0, 3)
    );
    assert_eq!(
        summary.by_failure_class,
        [
            ("html_landing_page".into(), 1),
            ("http_404".into(), 1),
            ("no_range_support".into(), 1)
        ]
        .into()
    );
    let dups = lines(&output.join("url-list/duplicates.jsonl"));
    assert_eq!(
        dups.iter()
            .map(|row| row["reason"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["normalized_url", "bundle_id", "vendor_name"]
    );
    let evidence = lines(&output.join("failures/http_404.jsonl"));
    assert_eq!(
        evidence[0]["evidence"]["final_url"],
        "https://cdn.example.org/moved.dmg"
    );
    assert_eq!(evidence[0]["evidence"]["first_bytes_text"], "release moved");

    assert_eq!(triage::triage(&output).unwrap(), 3);
    let task_path = output.join("agent-tasks/http_404.md");
    let result = triage::verify(&task_path, 1, &fixture).unwrap();
    assert!(!result.fixed);
    assert!(result.baseline_reproduced);
    assert_eq!(result.observed_class.as_deref(), Some("http_404"));

    let summary = pipeline::run(&run, &fixture, || 0).unwrap();
    assert_eq!(summary.requests, 3);
    assert_eq!(lines(&output.join("checkpoint.jsonl")).len(), 6);
    assert_eq!(lines(&output.join("url-list/results.jsonl")).len(), 3);
}

#[test]
fn feeds_scan_core_only_the_requested_ranges_and_exports_verified_architecture() {
    let scratch = tempfile::tempdir().unwrap();
    let input = scratch.path().join("inputs.txt");
    let output = scratch.path().join("out");
    let path = scratch.path().join("artifact-fixture.json");
    let url = "https://downloads.example.org/viewer.zip";
    let bytes = include_bytes!("../../../fixtures/stored.zip");
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    fs::write(
        &path,
        json!({"assets": {url: {"hex": hex, "etag": "\"version-1\""}}}).to_string(),
    )
    .unwrap();
    fs::write(&input, format!("{url}\n")).unwrap();
    let options = ScanOptions {
        scan_ranges: true,
        max_tier: Tier::Small,
        timeout_secs: 10,
    };
    let run = Run {
        connector: ConnectorId::UrlList,
        input,
        out: output.clone(),
        cache: None,
        pinned: false,
        limit: 1,
        options,
    };
    let fixture = Fixture::open(&path).unwrap();
    let summary = pipeline::run(&run, &fixture, || 0).unwrap();
    assert_eq!(
        (
            summary.reachable,
            summary.scanned,
            summary.verified,
            summary.failed
        ),
        (1, 1, 1, 0)
    );
    let rows = lines(&output.join("url-list/results.jsonl"));
    assert_eq!(rows[0]["status"], "verified");
    assert_eq!(rows[0]["probe"]["bytes_total"], bytes.len());
    assert_eq!(rows[0]["budget_attempts"], json!([8 * 1024 * 1024]));
    assert!(rows[0]["bundle_id"].is_string());
    assert!(!rows[0]["architectures"].as_array().unwrap().is_empty());
    assert!(rows[0]["native_apple_silicon"].is_null()); // Core did not inventory all bundled helpers.
    assert_eq!(rows[0]["bytes_read"], summary.bytes_read);
}

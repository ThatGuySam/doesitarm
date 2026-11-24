#!/usr/bin/env python3
"""Scan the run-1 selection of Homebrew casks using the native range-only CLI."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CATALOG_URL = "https://formulae.brew.sh/api/cask.json"
BUDGET = 8 * 1024 * 1024
LIMIT = 500_000_000
SELECTION = {
    "zip": (
        "claude", "codex-app", "telegram", "cursor", "macwhisper",
        "visual-studio-code", "appcleaner", "iterm2", "signal",
    ),
    "dmg": (
        "zed", "raycast", "warp", "timing", "little-snitch", "google-chrome",
        "firefox", "rider", "vlc", "gimp", "slack",
    ),
    "tar.gz": ("alfred@5", "gitbutler", "kunkun", "phoenix", "openpencil"),
    "pkg": ("zoom", "microsoft-teams", "teamviewer", "mullvad-vpn", "microsoft-auto-update"),
}


def hints(cask):
    result = []
    dependencies = cask.get("depends_on", {}).get("arch", [])
    allowed = set()
    for entry in dependencies:
        if entry.get("bits") == 64:
            axis = {"arm": "arm64", "intel": "x86_64"}.get(entry.get("type"))
            if axis:
                allowed.add(axis)
    if allowed:
        result.append({"source": "depends_on.arch", "expected": sorted(allowed), "match": "any"})

    url = unquote(cask["url"]).lower()
    if re.search(r"\buniversal(?:2)?\b", url):
        result.append({"source": "cask URL", "expected": ["arm64", "x86_64"], "match": "all"})
    elif re.search(r"(?<![a-z0-9])(?:aarch64|arm64|apple-silicon)(?![a-z0-9])|[-_]mac_arm\b", url):
        result.append({"source": "cask URL", "expected": ["arm64"], "match": "all"})
    elif re.search(r"(?<![a-z0-9])(?:amd64|x86_64|x64)(?![a-z0-9])", url):
        result.append({"source": "cask URL", "expected": ["x86_64"], "match": "all"})
    return result


def comparison(hints_, scan):
    observed = {
        ("arm64" if arch["name"] == "arm64e" else arch["name"])
        for arch in scan.get("architectures", [])
    }
    verdicts = []
    for hint in hints_:
        targets = set(hint["expected"])
        matches = bool(targets & observed) if hint["match"] == "any" else targets <= observed
        if not observed:
            verdict = "unavailable"
        elif matches:
            verdict = "consistent"
        elif scan.get("status") == "complete":
            verdict = "differs"
        else:
            verdict = "inconclusive"
        verdicts.append({**hint, "verdict": verdict})
    return verdicts


def scan_one(cli, format_, cask):
    url = cask["url"]
    if urlsplit(url).scheme != "https":
        raise ValueError(f"{cask['token']} URL does not use HTTPS")
    started = dt.datetime.now(dt.timezone.utc)
    try:
        command = [str(cli), "scan", url, "--budget", str(BUDGET), "--json"]
        proc = subprocess.run(command, capture_output=True, text=True, timeout=55, check=False)
        code = proc.returncode
        try:
            scan = json.loads(proc.stdout)
        except json.JSONDecodeError:
            scan = {"status": "cli_error", "error": (proc.stderr.strip() or "CLI returned no JSON")[:300]}
    except subprocess.TimeoutExpired:
        code = None
        scan = {"status": "timeout", "error": "55-second per-cask wall-clock timeout"}
    elapsed = (dt.datetime.now(dt.timezone.utc) - started).total_seconds()
    row = {
        "cask": cask["token"],
        "cask_version": cask["version"],
        "cask_deprecated": cask["deprecated"],
        "homepage": cask["homepage"],
        "url": url,
        "host": urlsplit(url).hostname,
        "expected_format": format_,
        "cask_sha256": cask["sha256"],
        "artifact_types": sorted({key for artifact in cask["artifacts"] for key in artifact}),
        "distinct_cask_variation_urls": len({
            variation["url"] for variation in cask.get("variations", {}).values()
            if variation.get("url") and variation["url"] != url
        }),
        "comparison": comparison(hints(cask), scan),
        "elapsed_seconds": round(elapsed, 3),
        "cli_exit_code": code,
        "scan": scan,
    }
    print(f"{cask['token']} — {scan['status']} ({scan.get('bytes_read', '?')} unique bytes)", flush=True)
    return row


def summary(report):
    totals = report["totals"]
    statuses = ", ".join(f"{quantity} {status.replace('_', ' ')}" for status, quantity in totals["statuses"].items())
    groups = ", ".join(f"{quantity} {format_}" for format_, quantity in totals["sample_formats"].items())
    lines = [
        "# Homebrew range scan 1",
        "",
        f"Started {report['started_at']}. The sample contains {groups} across "
        f"{totals['hosts']} download hosts. {statuses}.",
        "",
        f"The catalog used {report['catalog']['bytes']:,} bytes. The CLI read "
        f"{totals['unique_artifact_bytes']:,} unique artifact bytes and requested "
        f"{totals['requested_artifact_bytes']:,} bytes across "
        f"{totals['attempted_reads_with_reported_counts']:,} attempted range requests, "
        f"including discovery probes. The per-artifact budget was {BUDGET:,} bytes and the "
        f"combined catalog plus artifact body budget was {report['body_budget_maximum']:,} bytes.",
        "",
        "Only absolute HTTP ranges were requested. The observed architectures describe the named "
        "main executable. Candidate labels mark a binary observed before its plist was read. "
        "An asterisk marks fat-table entries whose thin headers were still unverified. "
        "Homebrew architecture dependencies and architecture words in the cask URL supply comparison "
        "hints. A cask URL accepted on Arm can contain a universal main executable.",
        "",
        "The sample keeps the deprecated `codex-app` cask to cover the requested Codex desktop download. "
        "Gifski had no cask entry in this snapshot. "
        "The ZIP and DMG labels for redirect endpoints come from their expected download types.",
        "",
        "| Cask | Detected format (or expected) | Result | Main architecture | Unique bytes / size | Requested bytes | Cask comparison | Error |",
        "| --- | --- | --- | --- | ---: | ---: | --- | --- |",
    ]
    for row in report["apps"]:
        result = row["scan"]
        arch = ", ".join(
            record["name"] + ("" if record["header_verified"] else "*")
            for record in result.get("architectures", [])
        )
        if not arch and result.get("candidate_executables"):
            verified = {}
            for entry in result["candidate_executables"]:
                for record in entry["architectures"]:
                    name = record["name"]
                    verified[name] = verified.get(name, False) or record["header_verified"]
            arch = ", ".join(
                name + ("" if checked else "*") for name, checked in sorted(verified.items())
            ) + " (candidates)"
        arch = arch or "—"
        if result.get("total_size"):
            read = result["bytes_read"]
            size = result["total_size"]
            volume = f"{read:,} / {size:,} ({read / size:.6%})"
        elif "bytes_read" in result:
            volume = f"{result['bytes_read']:,} / unknown"
        else:
            volume = "unknown"
        compares = "; ".join(
            f"{entry['source']} {','.join(entry['expected'])} ({entry['verdict']})"
            for entry in row["comparison"]
        ) or "No explicit hint"
        cells = [
            row["cask"], result.get("format") or f"({row['expected_format']})",
            result["status"].replace("_", " "), arch, volume,
            f"{result['bytes_requested']:,}" if "bytes_requested" in result else "unknown",
            compares, result.get("error") or "—",
        ]
        lines.append("| " + " | ".join(cell.replace("|", "\\|").replace("\n", " ") for cell in cells) + " |")
    return "\n".join(lines) + "\n"


def main():
    arg_parser = argparse.ArgumentParser(description=__doc__)
    arg_parser.add_argument("catalog", type=Path, help="local response from the Homebrew cask.json endpoint")
    arg_parser.add_argument("--cli", type=Path, default=ROOT / "target/debug/scan-cli")
    arg_parser.add_argument("--output", type=Path, default=ROOT / "target" / "homebrew-results")
    args = arg_parser.parse_args()
    cli = args.cli.resolve()
    catalog = args.catalog.read_bytes()
    casks = {item["token"]: item for item in json.loads(catalog)}
    selected = [(format_, casks[token]) for format_, tokens in SELECTION.items() for token in tokens]
    if len(selected) != 30 or len({cask["token"] for _, cask in selected}) != 30:
        raise ValueError("Expected 30 distinct casks")
    if any(cask["disabled"] for _, cask in selected):
        raise ValueError("Run-1 selection contains a disabled cask")
    bound = len(catalog) + len(selected) * BUDGET
    if bound >= LIMIT:
        raise ValueError("Run exceeds the 500 MB body budget")

    started = dt.datetime.now(ZoneInfo("America/Chicago")).isoformat(timespec="seconds")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    with cli.open("rb") as binary:
        cli_sha = hashlib.file_digest(binary, "sha256").hexdigest()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending = [pool.submit(scan_one, cli, format_, cask) for format_, cask in selected]
        rows = [task.result() for task in pending]

    scans = [row["scan"] for row in rows]
    report = {
        "started_at": started,
        "scanner_commit": commit,
        "cli_sha256": cli_sha,
        "catalog": {
            "url": CATALOG_URL,
            "bytes": len(catalog),
            "sha256": hashlib.sha256(catalog).hexdigest(),
            "cask_count": len(casks),
            "requested_cask_unavailable": ["gifski"] if "gifski" not in casks else [],
        },
        "maximum_bytes_per_artifact": BUDGET,
        "body_budget_maximum": bound,
        "totals": {
            "statuses": dict(Counter(scan["status"] for scan in scans)),
            "sample_formats": {format_: len(tokens) for format_, tokens in SELECTION.items()},
            "hosts": len({row["host"] for row in rows}),
            "unique_artifact_bytes": sum(scan.get("bytes_read", 0) for scan in scans),
            "requested_artifact_bytes": sum(scan.get("bytes_requested", 0) for scan in scans),
            "attempted_reads_with_reported_counts": sum(scan.get("reads", 0) for scan in scans),
            "casks_with_unknown_counts": sum("bytes_read" not in scan for scan in scans),
        },
        "apps": rows,
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "homebrew-run-1.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (args.output / "homebrew-run-1.md").write_text(summary(report))


if __name__ == "__main__":
    main()

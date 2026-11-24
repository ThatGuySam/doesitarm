#!/usr/bin/env python3
"""Create fixed Homebrew corpora and checkpoint one HTTP scan at a time."""
import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MIB = 1024 * 1024
CATALOG_URL = "https://formulae.brew.sh/api/cask.json"
FORMATS = {
    "zip": (".zip",),
    "dmg": (".dmg",),
    "tar.gz": (".tar.gz", ".tgz"),
    "pkg": (".pkg", ".mpkg"),
    "other": (".tar.xz", ".txz", ".tar.bz2", ".tbz", ".tbz2", ".tar.zst", ".tar", ".7z", ".rar", ".xip"),
}
QUOTAS = {"zip": 19, "dmg": 19, "tar.gz": 12, "pkg": 15, "other": 5}
APP_ARTIFACTS = {"app", "pkg", "installer", "binary", "suite"}


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load(path):
    return json.loads(path.read_text())


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def kinds(cask):
    return {kind for artifact in cask["artifacts"] for kind in artifact}


def expected_format(url, artifacts):
    path = unquote(urlsplit(url).path).lower()
    for label, suffixes in FORMATS.items():
        for suffix in suffixes:
            if path.endswith(suffix):
                return suffix[1:] if label == "other" else label
    if "pkg" in artifacts and "app" not in artifacts:
        return "pkg"
    return "unknown"


def architecture_hints(cask, url):
    allowed = sorted({
        name
        for arch in cask.get("depends_on", {}).get("arch", [])
        if arch.get("bits") == 64
        if (name := {"arm": "arm64", "intel": "x86_64"}.get(arch.get("type")))
    })
    path = unquote(urlsplit(url).path).lower()
    url_arches = []
    if re.search(r"(?<![a-z0-9])universal2?(?![a-z0-9])", path):
        url_arches = ["arm64", "x86_64"]
    elif re.search(r"(?<![a-z0-9])(?:aarch64|arm64|apple-silicon|mac_arm)(?![a-z0-9])", path):
        url_arches = ["arm64"]
    elif re.search(r"(?<![a-z0-9])(?:amd64|x86_64|x64)(?![a-z0-9])", path):
        url_arches = ["x86_64"]
    hints = []
    if allowed:
        hints.append({"source": "depends_on.arch", "expected": allowed, "match": "any"})
    if url_arches:
        hints.append({"source": "URL path", "expected": url_arches, "match": "all"})
    return hints


def entry(cask, variation=None):
    effective = {**cask, **(variation or {})}
    url = effective["url"]
    artifacts = kinds(effective)
    apps = [artifact["app"][0] for artifact in effective["artifacts"] if artifact.get("app")]
    return {
        "cask": cask["token"], "url": url, "version": effective["version"],
        "sha256": effective.get("sha256"), "expected_format": expected_format(url, artifacts),
        "artifact_types": sorted(artifacts & APP_ARTIFACTS), "declared_apps": apps,
        "architecture_hints": architecture_hints(effective, url),
    }


def eligible(cask):
    url = urlsplit(cask["url"])
    return (
        not cask.get("disabled")
        and kinds(cask) & APP_ARTIFACTS
        and url.scheme in {"https", "http"}
        and url.hostname
        and not cask.get("linux_only", False)
    )


def stratified(entries, quotas, salt):
    groups = defaultdict(list)
    for row in entries:
        label = row["expected_format"]
        if label != "unknown" and label not in QUOTAS:
            label = "other"
        groups[label].append(row)

    selected = []
    hosts = Counter()
    for label, count in quotas.items():
        available = sorted(
            groups[label],
            key=lambda row: hashlib.sha256(f"{salt}:{row['cask']}".encode()).digest(),
        )
        if len(available) < count:
            raise ValueError(f"Only {len(available)} eligible {label} entries for a quota of {count}")
        for _ in range(count):
            index = min(range(len(available)), key=lambda i: hosts[urlsplit(available[i]["url"]).hostname])
            row = available.pop(index)
            selected.append(row)
            hosts[urlsplit(row["url"]).hostname] += 1
    # Interleave container strata so a partial run still samples each category.
    return sorted(selected, key=lambda row: hashlib.sha256(f"scan:{salt}:{row['cask']}".encode()).digest())


def initialize(args):
    catalog = load(args.catalog)
    prior = load(ROOT / "results/homebrew-run-1.json")
    catalog_sha = digest(args.catalog)
    if catalog_sha != prior["catalog"]["sha256"]:
        raise ValueError("Use the catalog snapshot pinned by homebrew-run-1.json to recreate the fixed sets")
    indexed = {cask["token"]: cask for cask in catalog}
    original = [
        {**entry(indexed[row["cask"]]), "expected_format": row["expected_format"]}
        for row in prior["apps"]
    ]
    used = {row["cask"] for row in original}
    candidates = [entry(cask) for cask in catalog if eligible(cask) and cask["token"] not in used]
    regression = original + stratified(candidates, QUOTAS, "regression")
    used = {row["cask"] for row in regression}
    held_out = stratified(
        [row for row in candidates if row["cask"] not in used],
        {"zip": 24, "dmg": 28, "tar.gz": 18, "pkg": 20, "other": 10}, "held-out",
    )
    for name, entries in (("regression", regression), ("held-out", held_out)):
        path = args.output / f"{name}.json"
        if path.exists():
            raise ValueError(f"Fixed corpus already exists at {path}")
        save(path, {"catalog_url": CATALOG_URL, "catalog_sha256": catalog_sha, "entries": entries})
        print(f"{name}: {len(entries)} casks, {len({urlsplit(row['url']).hostname for row in entries})} hosts")


def full_manifest(args):
    rows = []
    for cask in load(args.catalog):
        entries = [(None, entry(cask))] if eligible(cask) else []
        for platform, variation in sorted(cask.get("variations", {}).items()):
            if platform.endswith("_linux"):
                continue
            if eligible({**cask, **variation}):
                entries.append((platform, entry(cask, variation)))
        unique = {}
        for platform, row in entries:
            key = (row["url"], row["version"], row["sha256"])
            if key not in unique:
                unique[key] = {**row, "platforms": []}
            if platform is not None:
                unique[key]["platforms"].append(platform)
        rows.extend(unique.values())
    rows.sort(key=lambda row: hashlib.sha256(f"{row['cask']}:{row['url']}".encode()).digest())
    if args.output.exists():
        raise ValueError(f"Full manifest already exists at {args.output}")
    save(args.output, {"catalog_url": CATALOG_URL, "catalog_sha256": digest(args.catalog), "entries": rows})
    print(f"{len(rows)} artifacts across {len({row['cask'] for row in rows})} casks")


def category(entry_, scan):
    status = scan["status"]
    error = (scan.get("error") or "").lower()
    if status == "complete":
        declared = entry_["declared_apps"]
        if len(declared) > 1:
            return "multi_app"
        actual = scan.get("bundle_path") or ""
        if declared and not actual.endswith(declared[0]):
            return "executable_not_found"
        if not scan.get("architectures") or not all(a["header_verified"] for a in scan["architectures"]):
            return "executable_not_found"
        if not scan.get("bundle_id") or not scan.get("version") or not scan.get("min_macos"):
            return "metadata_missing"
        return "verified"
    if status == "budget_exhausted":
        return "budget_hit"
    if "http 200" in error and "expected 206" in error:
        return "host_200_to_range"
    if re.search(r"\bhttp (?:401|403|404|410)\b", error):
        return "http_" + re.search(r"\bhttp (\d+)\b", error)[1]
    if status == "timeout":
        return "timeout"
    if status == "source_error":
        return "other_source_error"
    if "multi-app" in error:
        return "multi_app"
    if "nested" in error:
        return "nested_container"
    if "encrypted" in error or "password" in error:
        return "encrypted"
    if status == "unsupported":
        if any(term in error for term in ("codec", "compression", "compressed", "zip method")):
            return "unsupported_codec"
        return "unsupported_container"
    if status == "not_found":
        if "executable" in error or "mach-o" in error:
            return "executable_not_found"
        if "app" in error or "info.plist" in error:
            return "plist_not_found"
    return "other"


def comparisons(entry_, scan, outcome):
    observed = {
        "arm64" if arch["name"] == "arm64e" else arch["name"]
        for arch in scan.get("architectures", [])
        if arch["header_verified"]
    }
    result = []
    for hint in entry_["architecture_hints"]:
        expected = set(hint["expected"])
        agrees = bool(expected & observed) if hint["match"] == "any" else expected <= observed
        if outcome != "verified":
            verdict = "inconclusive" if observed else "unavailable"
        else:
            verdict = "agrees" if agrees else "disagrees"
        result.append({**hint, "observed": sorted(observed), "verdict": verdict})
    return result


def attempt(cli, entry_, budget, timeout, cli_options):
    start = time.monotonic()
    command = [str(cli), "scan", entry_["url"], "--budget", str(budget), "--json", *cli_options]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
        try:
            scan = json.loads(result.stdout)
        except json.JSONDecodeError:
            scan = {"status": "cli_error", "error": (result.stderr.strip() or "CLI returned no JSON")[:500]}
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        scan = {"status": "timeout", "error": f"{timeout}s per-attempt deadline"}
        exit_code = None
    return {
        "budget": budget,
        "elapsed_seconds": round(time.monotonic() - start, 3),
        "exit_code": exit_code,
        "category": category(entry_, scan),
        "scan": scan,
    }


def scan_entry(args, entry_):
    attempts = [attempt(args.cli, entry_, args.budget, args.timeout, args.cli_option)]
    for budget in args.escalate:
        previous = attempts[-1]
        scan = previous["scan"]
        format_ = scan.get("format") or entry_["expected_format"]
        sequential = {"pkg", "zip", "tar.gz", "tar.xz", "tar.bz2", "tgz", "txz", "tbz2"}
        if previous["category"] != "budget_hit" or format_ not in sequential:
            break
        if scan.get("total_size", 0) and scan["total_size"] <= previous["budget"]:
            break
        attempts.append(attempt(args.cli, entry_, budget, args.timeout, args.cli_option))
    last = attempts[-1]
    return {
        **entry_, "host": urlsplit(entry_["url"]).hostname, "category": last["category"],
        "comparison": comparisons(entry_, last["scan"], last["category"]),
        "attempts": attempts,
    }


@contextmanager
def scan_lock():
    lock = ROOT / "target/climb.lock"
    lock.parent.mkdir(exist_ok=True)
    with lock.open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def checkpoint_rows(path):
    if not path.exists():
        return []
    rows = []
    with path.open("rb+") as stream:
        while line := stream.readline():
            if not line.endswith(b"\n"):
                # A kill during append can leave only the final row unfinished.
                stream.truncate(stream.tell() - len(line))
                break
            rows.append(json.loads(line))
    return rows


def cell(value):
    return str(value or "—").replace("|", "\\|").replace("\n", " ")


def publish(output, metadata, rows):
    categories = Counter(row["category"] for row in rows)
    formats = defaultdict(Counter)
    comparisons_ = Counter()
    accepted_bytes = reads = unmetered = 0
    for row in rows:
        final = row["attempts"][-1]["scan"]
        formats[final.get("format") or row["expected_format"]][row["category"]] += 1
        comparisons_.update(hint["verdict"] for hint in row["comparison"])
        for attempt_ in row["attempts"]:
            scan = attempt_["scan"]
            accepted_bytes += scan.get("bytes_read", 0)
            reads += scan.get("reads", 0)
            unmetered += "bytes_read" not in scan
    totals = {
        "checked": len(rows), "by_outcome": dict(categories),
        "by_container": {name: dict(counts) for name, counts in sorted(formats.items())},
        "architecture_hints": dict(comparisons_), "accepted_bytes": accepted_bytes,
        "reported_reads": reads, "attempts_with_unknown_bytes": unmetered,
    }
    save(output / "run.json", {**metadata, "updated_at": timestamp(), "totals": totals, "artifacts": rows})
    lines = [
        "# Homebrew scanner scoreboard", "",
        f"{len(rows):,}/{metadata['manifest_count']:,} artifacts checked. "
        f"{categories['verified']:,} verified. Run started {metadata['started_at']}.", "",
        f"Across all attempts, the CLI reported {accepted_bytes:,} bytes and {reads:,} reads. "
        f"{unmetered} attempts ended without byte counts.", "",
        "| Container | Scanned | Verified | Outcomes |", "| --- | ---: | ---: | --- |",
    ]
    for format_, counts in sorted(formats.items()):
        detail = ", ".join(f"{key} {count}" for key, count in sorted(counts.items()))
        lines.append(f"| {format_} | {sum(counts.values()):,} | {counts['verified']:,} | {detail} |")
    lines += ["", "## Outcome totals", "", "| Outcome | Count |", "| --- | ---: |"]
    lines.extend(f"| {name} | {count:,} |" for name, count in categories.most_common())
    lines += ["", "## Architecture hints", ""]
    lines.extend(f"- {verdict} {count:,}" for verdict, count in sorted(comparisons_.items()))
    disagreements = [
        (row, hint) for row in rows for hint in row["comparison"] if hint["verdict"] == "disagrees"
    ]
    if disagreements:
        lines += ["", "| Cask | Hint | Expected | Observed |", "| --- | --- | --- | --- |"]
        for row, hint in disagreements:
            lines.append(
                f"| {row['cask']} | {hint['source']} | {', '.join(hint['expected'])} | {', '.join(hint['observed'])} |"
            )
    lines += ["", "## Unresolved artifacts", "", "| Cask | Container | Outcome | Evidence |", "| --- | --- | --- | --- |"]
    for row in rows:
        if row["category"] == "verified":
            continue
        scan = row["attempts"][-1]["scan"]
        evidence = scan.get("error") or f"app registration {row['declared_apps']}, scanner bundle {scan.get('bundle_path')}"
        lines.append("| " + " | ".join(map(cell, (row["cask"], scan.get("format") or row["expected_format"],
                                                 row["category"], evidence))) + " |")
    dest = output / "scoreboard.md"
    temporary = dest.with_suffix(".md.tmp")
    temporary.write_text("\n".join(lines) + "\n")
    temporary.replace(dest)


def run(args):
    args.cli = args.cli.resolve()
    if not args.cli.is_file():
        raise ValueError(f"Scanner binary missing at {args.cli}")
    if args.escalate != sorted(set(args.escalate)) or any(n <= args.budget for n in args.escalate):
        raise ValueError("Escalation budgets must be unique, increasing, and above the base budget")
    manifest = load(args.manifest)
    entries = manifest["entries"]
    args.output.mkdir(parents=True, exist_ok=True)
    metadata_path = args.output / "metadata.json"
    parameters = {
        "manifest_sha256": digest(args.manifest), "catalog_sha256": manifest["catalog_sha256"],
        "manifest_count": len(entries),
        "cli_sha256": digest(args.cli), "budget": args.budget, "escalate": args.escalate,
        "timeout": args.timeout, "cli_options": args.cli_option, "host_cooldown": args.host_cooldown,
    }
    with scan_lock():
        if metadata_path.exists():
            metadata = load(metadata_path)
            if any(metadata.get(key) != value for key, value in parameters.items()):
                raise ValueError("Checkpoint uses different inputs, scanner binary, or scan policy. Choose a new output directory.")
        else:
            commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            metadata = {**parameters, "scanner_commit_at_start": commit, "started_at": timestamp()}
            save(metadata_path, metadata)
        checkpoint = args.output / "checkpoint.ndjson"
        rows = checkpoint_rows(checkpoint)
        pending = entries[len(rows):]
        if args.limit is not None:
            pending = pending[:args.limit]
        last_finished = {}
        if rows:
            last_finished[rows[-1]["host"]] = time.monotonic()
        try:
            with checkpoint.open("a") as stream:
                for entry_ in pending:
                    host = urlsplit(entry_["url"]).hostname
                    if host in last_finished:
                        time.sleep(max(0, args.host_cooldown - (time.monotonic() - last_finished[host])))
                    row = scan_entry(args, entry_)
                    last_finished[host] = time.monotonic()
                    stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    stream.flush()
                    os.fsync(stream.fileno())
                    rows.append(row)
                    print(f"{len(rows)}/{len(entries)} {row['cask']} {row['category']}", flush=True)
                    if len(rows) % 10 == 0:
                        publish(args.output, metadata, rows)
        finally:
            publish(args.output, metadata, rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(required=True)
    for name, action in (("init", initialize), ("full-manifest", full_manifest)):
        catalog = commands.add_parser(name)
        catalog.add_argument("catalog", type=Path)
        catalog.add_argument("output", type=Path)
        catalog.set_defaults(action=action)
    measure = commands.add_parser("run")
    measure.add_argument("manifest", type=Path)
    measure.add_argument("output", type=Path)
    measure.add_argument("--cli", type=Path, default=ROOT / "target/release/scan-cli")
    measure.add_argument("--budget", type=int, default=8 * MIB)
    measure.add_argument("--escalate", type=int, action="append", default=[])
    measure.add_argument("--timeout", type=int, default=30)
    measure.add_argument("--host-cooldown", type=float, default=1.0)
    measure.add_argument("--cli-option", action="append", default=[])
    measure.add_argument("--limit", type=int)
    measure.set_defaults(action=run)
    args = parser.parse_args()
    args.action(args)


if __name__ == "__main__":
    main()

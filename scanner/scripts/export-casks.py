#!/usr/bin/env python3
"""Atomically merge normalized, versioned cask facts from scanner run reports."""

import argparse
from collections import Counter, defaultdict
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile

DEFAULT_OUTPUT = Path.home() / "Code" / "doesitarm-data" / "homebrew-scans"
VERIFIED = {"verified", "verified_executable", "verified_plugin"}
BASE_CONTAINERS = {"zip", "dmg", "pkg", "tar.gz"}
ARM = {"arm64", "arm64e"}


def atomic_write(path, rows, *, lines=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        scratch = Path(stream.name)
        try:
            if lines:
                for row in rows:
                    stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            else:
                json.dump(rows, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
            scratch.replace(path)
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            scratch.unlink(missing_ok=True)


def observed(row, run, names):
    attempt = row["attempts"][-1]
    scan = attempt["scan"]
    inventory = scan.get("inventory")
    slices = scan.get("architectures", [])
    verified = [arch for arch in slices if arch["header_verified"]]
    names_of_slices = sorted({arch["name"] for arch in verified})
    all_verified = bool(slices) and len(verified) == len(slices)
    both = bool(set(names_of_slices) & ARM) and "x86_64" in names_of_slices
    arm = bool(set(names_of_slices) & ARM)
    if not arm:
        native = False if all_verified else None
    elif row["category"] not in VERIFIED:
        native = None
    elif scan.get("bundle_path"):
        native = True if inventory and inventory.get("all_arm64_capable") is True else None
    else:
        native = True
    signatures = [arch.get("code_signature_present") for arch in verified]
    signed = True if True in signatures else False if all_verified and all(flag is False for flag in signatures) else None
    outcome = row["category"]
    evidence = bool(
        names_of_slices or scan.get("bundle_id") or scan.get("installer")
        or (inventory and inventory.get("binaries")) or scan.get("script_runtime")
    )
    status = "verified" if outcome in VERIFIED else "partial" if evidence else "unscannable"
    actual = scan.get("format") or row.get("expected_format")
    comparisons = row.get("comparison", [])
    verdicts = {hint["verdict"] for hint in comparisons}
    return {
        "token": row["cask"],
        "name": names.get(row["cask"], scan.get("name") or row["cask"]),
        "version": row["version"],
        "url": row["url"],
        "container": actual if actual in BASE_CONTAINERS else "other",
        "detected_format": scan.get("format"),
        "status": status,
        "unscannable_reason": None if status == "verified" else scan.get("error") or outcome,
        "architectures": names_of_slices,
        "native_apple_silicon": native,
        "universal": True if both else False if all_verified else None,
        "bundle_id": scan.get("bundle_id"),
        "app_name": scan.get("name"),
        "app_version": scan.get("version"),
        "executable": scan.get("executable_name") or scan.get("executable_path"),
        "min_macos": scan.get("min_macos"),
        "signed": signed,
        "bytes_read": scan.get("bytes_read"),
        "bytes_total": scan.get("total_size") or None,
        "requests": scan.get("reads"),
        "cask_arch_hint": row.get("architecture_hints", []),
        "hint_agrees": False if "disagrees" in verdicts else True if "agrees" in verdicts else None,
        "inventory": inventory,
        "script_runtime": scan.get("script_runtime"),
        "scanner_commit": run["scanner_commit_at_start"],
        "scanned_at": attempt.get("scanned_at") or run["updated_at"],
    }


def representations(rows):
    by_url = {}
    for row in rows:
        if row["url"] not in by_url or row["scanned_at"] >= by_url[row["url"]]["scanned_at"]:
            by_url[row["url"]] = row
    ranks = {"verified": 2, "partial": 1, "unscannable": 0}
    return sorted(by_url.values(), key=lambda row: (
        ranks[row["status"]],
        row["native_apple_silicon"] is True,
        bool(set(row["architectures"]) & ARM),
        bool((row.get("inventory") or {}).get("complete")),
        row["scanned_at"],
        row["url"],
    ), reverse=True)


def without_variants(row):
    return {key: value for key, value in row.items() if key != "representations"}


def export(paths, output, names):
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".export.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        versions = defaultdict(list)
        path = output / "casks.jsonl"
        if path.is_file():
            for line in path.read_text().splitlines():
                row = json.loads(line)
                versions[(row["token"], row["version"])].extend(
                    [without_variants(row), *row.get("representations", [])]
                )
        for report in paths:
            data = report.read_bytes()
            run = json.loads(data)
            counts = Counter()
            taxonomy = Counter()
            for row in run["artifacts"]:
                result = observed(row, run, names)
                versions[(result["token"], result["version"])].append(result)
                counts[result["status"]] += 1
                taxonomy[row["category"]] += 1
            identifier = f"{report.parent.name}-{hashlib.sha256(data).hexdigest()[:12]}"
            atomic_write(output / "runs" / f"{identifier}.json", {
                "scanner_commit": run["scanner_commit_at_start"],
                "cli_sha256": run["cli_sha256"],
                "manifest_sha256": run["manifest_sha256"],
                "started_at": run["started_at"],
                "finished_at": run["updated_at"],
                "artifact_count": len(run["artifacts"]),
                "planned_artifacts": run["manifest_count"],
                "counts": dict(counts),
                "outcomes": dict(taxonomy),
            })
        normalized = []
        for key in sorted(versions):
            main, *other = representations(versions[key])
            normalized.append({**main, **({"representations": other} if other else {})})
        atomic_write(path, normalized, lines=True)
        return len(normalized)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--catalog", type=Path, help="Homebrew cask JSON snapshot for display names")
    args = parser.parse_args()
    names = {}
    if args.catalog:
        for row in json.loads(args.catalog.read_text()):
            if row.get("name"):
                names[row["token"]] = row["name"][0]
    count = export(args.reports, args.output, names)
    print(f"Wrote {count} cask versions to {args.output / 'casks.jsonl'}")


if __name__ == "__main__":
    main()

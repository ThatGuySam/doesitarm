#!/usr/bin/env python3
"""Create fixed Homebrew corpora and checkpoint one HTTP scan at a time."""
import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
import datetime as dt
import fcntl
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import unicodedata
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
VERIFIED = {"verified", "verified_executable", "verified_plugin"}


class DeadlineReached(Exception):
    """An artifact interrupted by the campaign deadline remains pending."""


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load(path):
    if path.suffix == ".gz":
        with gzip.open(path, "rt") as stream:
            return json.load(stream)
    return json.loads(path.read_text())


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    if path.suffix == ".gz":
        temporary.write_bytes(gzip.compress(
            (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode(), mtime=0,
        ))
    else:
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
    elif re.search(r"(?<![a-z0-9])(?:amd64|x86[-_]64|x64)(?![a-z0-9])", path):
        url_arches = ["x86_64"]
    hints = []
    if allowed:
        hints.append({"source": "depends_on.arch", "expected": allowed, "match": "any"})
    if url_arches:
        hints.append({"source": "URL path", "expected": url_arches, "match": "all"})
    return hints


def binary_paths(cask):
    declared = set()
    for artifact in cask["artifacts"]:
        if not artifact.get("binary") or not isinstance(artifact["binary"][0], str):
            continue
        path = artifact["binary"][0].removeprefix("./")
        prefix = rf"^\$HOMEBREW_PREFIX/Caskroom/{re.escape(cask['token'])}/[^/]+/"
        path = re.sub(prefix, "", path)
        if path and not path.startswith(("/", "$")) and all(
            component not in {"", ".", ".."} for component in path.split("/")
        ):
            declared.add(path)
    return sorted(declared)


def entry(cask, variation=None):
    effective = {**cask, **(variation or {})}
    url = effective["url"]
    artifacts = kinds(effective)
    apps = [artifact["app"][0] for artifact in effective["artifacts"] if artifact.get("app")]
    return {
        "cask": cask["token"], "url": url, "version": effective["version"],
        "sha256": effective.get("sha256"), "expected_format": expected_format(url, artifacts),
        "artifact_types": sorted(artifacts & APP_ARTIFACTS), "declared_apps": apps,
        "declared_binaries": binary_paths(effective),
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
    catalog = load(args.catalog)
    rows = []
    exclusions = Counter()
    excluded_downloads = []
    for cask in catalog:
        variations = cask.get("variations", {})
        platforms = [name for name in cask["supported_platforms"] if not name.endswith("_linux")]
        if not platforms:
            exclusions["linux_only"] += 1
            continue
        artifact_sets = [kinds({**cask, **variations.get(platform, {})}) for platform in platforms]
        if not any(artifacts & APP_ARTIFACTS for artifacts in artifact_sets):
            exclusions["no_app_or_executable_artifact"] += 1
            continue
        unique = {}
        platform_downloads = {}
        for platform, artifacts in zip(platforms, artifact_sets):
            if not artifacts & APP_ARTIFACTS:
                continue
            effective = {**cask, **variations.get(platform, {})}
            languages = effective.get("language_variations") or []
            for language in [{}] + languages:
                localized = {**effective, **language}
                row = entry(cask, localized)
                key = (row["url"], row["version"], row["sha256"])
                if not language:
                    platform_downloads[platform] = key
                if key not in unique:
                    url = urlsplit(row["url"])
                    specs = localized.get("url_specs") or {}
                    reason = None
                    if url.scheme not in {"https", "http"} or not url.hostname:
                        reason = "non_http_download"
                    elif url.username is not None or url.password is not None:
                        reason = "url_credentials"
                    elif specs.get("branch") or url.path.endswith(".git"):
                        reason = "vcs_checkout"
                    elif specs.get("data"):
                        reason = "catalog_requires_post"
                    if reason:
                        exclusions[reason] += 1
                        excluded_downloads.append({"cask": cask["token"], "scheme": url.scheme, "reason": reason})
                        unique[key] = None
                        continue
                    unique[key] = {
                        **row, "platforms": [], "languages": [], "disabled": localized.get("disabled", False),
                        "container_hint": localized.get("container"),
                        "request_spec_fields": sorted(specs),
                    }
                artifact = unique[key]
                if artifact is None:
                    continue
                artifact["platforms"].append(platform)
                artifact["languages"].extend(language.get("languages", []))
                for field in ("artifact_types", "declared_apps", "declared_binaries", "architecture_hints"):
                    artifact[field].extend(value for value in row[field] if value not in artifact[field])
        for platform, key in platform_downloads.items():
            opposite = platform.removeprefix("arm64_") if platform.startswith("arm64_") else f"arm64_{platform}"
            if (
                (alternate := platform_downloads.get(opposite)) is not None
                and alternate[0] != key[0]
                and unique[key] is not None
            ):
                architecture = "arm64" if platform.startswith("arm64_") else "x86_64"
                hint = {"source": "platform-specific URL", "expected": [architecture], "match": "all"}
                if hint not in unique[key]["architecture_hints"]:
                    unique[key]["architecture_hints"].append(hint)
        for row in unique.values():
            if row is not None:
                row["platforms"] = sorted(set(row["platforms"]))
                row["languages"] = sorted(set(row["languages"]))
                rows.append(row)
    rows.sort(key=lambda row: hashlib.sha256(f"{row['cask']}:{row['url']}".encode()).digest())
    if args.output.exists():
        raise ValueError(f"Full manifest already exists at {args.output}")
    save(args.output, {
        "catalog_url": CATALOG_URL, "catalog_sha256": digest(args.catalog), "catalog_casks": len(catalog),
        "exclusions": dict(exclusions), "excluded_downloads": excluded_downloads, "entries": rows,
    })
    print(f"{len(rows)} artifacts across {len({row['cask'] for row in rows})} casks")


def category(entry_, scan, target=None):
    status = scan["status"]
    error = (scan.get("error") or "").lower()
    if status == "complete":
        if target and target[0] == "executable":
            if scan.get("executable_path") and scan.get("architectures") and all(
                arch["header_verified"] for arch in scan["architectures"]
            ):
                return "verified_executable" if scan.get("min_macos") else "metadata_missing"
            return "executable_not_found"
        declared = [target[1]] if target else entry_["declared_apps"]
        if len(declared) > 1:
            return "multi_app"
        def path_parts(path):
            return unicodedata.normalize("NFC", path).casefold().removeprefix("./").split("/")
        if declared:
            expected = path_parts(declared[0])
            paths = (scan.get("bundle_path"), scan.get("wrapper_path"))
            if not any(path_parts(path)[-len(expected):] == expected for path in paths if path):
                return "executable_not_found"
        if not scan.get("architectures") or not all(a["header_verified"] for a in scan["architectures"]):
            return "executable_not_found"
        if not scan.get("bundle_id") or not scan.get("version") or not scan.get("min_macos"):
            return "metadata_missing"
        if scan.get("bundle_kind") not in (None, "app"):
            return "verified_plugin"
        return "verified"
    if status == "budget_exhausted":
        return "budget_hit"
    if "http 200" in error and "expected 206" in error:
        return "host_200_to_range"
    if re.search(r"\bhttp (?:401|403|404|410|429)\b", error):
        return "http_" + re.search(r"\bhttp (\d+)\b", error)[1]
    if status == "timeout":
        return "timeout"
    if status == "source_error":
        return "other_source_error"
    if "installer distribution references remote" in error:
        return "installer_remote_components"
    if (scan.get("source_content_type") or "").split(";")[0].strip().lower() == "text/html":
        if scan.get("format") is None:
            return "html_response"
    if "multi-app" in error:
        return "multi_app"
    if "encrypted or sealed" in error:
        return "encrypted_or_sealed"
    if "encrypted" in error or "password" in error:
        return "encrypted"
    if "nested" in error or scan.get("nested_artifacts"):
        return "nested_container"
    if "declared executable is a script" in error:
        slices = (scan.get("script_runtime") or {}).get("architectures", [])
        return "script_runtime_verified" if slices and all(arch["header_verified"] for arch in slices) else "script_executable"
    if any(text in error for text in ("executable is not mach-o", "executable is elf", "dos/pe magic")):
        return "non_macho_executable"
    if "executable" in error and any(text in error for text in ("symlink", " is a link")):
        return "linked_executable"
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
        if outcome not in VERIFIED:
            verdict = "inconclusive" if observed else "unavailable"
        else:
            verdict = "agrees" if agrees else "disagrees"
        result.append({**hint, "observed": sorted(observed), "verdict": verdict})
    return result


def attempt(cli, entry_, budget, timeout, cli_options, target=None, deadline=None):
    start = time.monotonic()
    command = [str(cli), "scan", entry_["url"], "--budget", str(budget), "--json", *cli_options]
    if target:
        command.extend(["--bundle-path" if target[0] == "bundle" else "--binary-path", target[1]])
    remaining = timeout if deadline is None else deadline - time.time()
    if remaining <= 0:
        raise DeadlineReached
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=min(timeout, remaining), check=False)
        if result.returncode == 2:
            raise ValueError(f"Scanner rejected the scan options: {result.stderr.strip()[:300]}")
        try:
            scan = json.loads(result.stdout)
            if scan.get("error"):
                # Redirect diagnostics may contain an ephemeral signed query.
                scan["error"] = re.sub(r"(https?://[^\s?]+)\?[^\s]+", r"\1?[redacted]", scan["error"])
        except json.JSONDecodeError:
            scan = {"status": "cli_error", "error": (result.stderr.strip() or "CLI returned no JSON")[:500]}
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        if remaining < timeout:
            raise DeadlineReached from None
        scan = {"status": "timeout", "error": f"{timeout}s per-attempt deadline"}
        exit_code = None
    record = {
        "budget": budget,
        "elapsed_seconds": round(time.monotonic() - start, 3),
        "scanned_at": timestamp(),
        "exit_code": exit_code,
        "category": category(entry_, scan, target),
        "scan": scan,
    }
    if target:
        record["target"] = {"kind": target[0], "path": target[1]}
    return record


def attempts_for(args, entry_, target):
    attempts = [attempt(args.cli, entry_, args.budget, args.timeout, args.cli_option, target, args.stop_at)]
    for budget in args.escalate:
        previous = attempts[-1]
        scan = previous["scan"]
        format_ = scan.get("format") or entry_["expected_format"]
        sequential = {"pkg", "zip", "7z", "tar.gz", "tar.xz", "tar.bz2", "tar.zst", "tgz", "txz", "tbz", "tbz2"}
        if previous["category"] != "budget_hit":
            break
        nested_package = any(
            path.lower().endswith((".pkg", ".mpkg", "/archive.pax.gz"))
            for path in scan.get("nested_artifacts", [])
        )
        if format_ not in sequential and scan.get("source_transport") != "stream" and not nested_package:
            break
        attempts.append(attempt(args.cli, entry_, budget, args.timeout, args.cli_option, target, args.stop_at))
    return attempts


def scan_targets(entry_, use_targets):
    if use_targets:
        if entry_["declared_apps"]:
            return [("bundle", app) for app in entry_["declared_apps"]]
        if not set(entry_["artifact_types"]) & {"pkg", "installer"} and entry_.get("declared_binaries"):
            return [("executable", path) for path in entry_["declared_binaries"]]
    return [None]


def scan_entry(args, entry_, targets):
    attempts = []
    finals = []
    for target in targets:
        result = attempts_for(args, entry_, target)
        attempts.extend(result)
        finals.append(result[-1])
        if result[-1]["category"] in {"http_401", "http_403", "http_404", "http_410", "http_429"}:
            break
    last = finals[-1]
    outcome = last["category"]
    validators = {item["scan"].get("source_etag") for item in finals}
    if len(finals) > 1 and (any(item["category"] not in VERIFIED for item in finals) or len(validators) != 1 or None in validators):
        outcome = "multi_app" if targets[0][0] == "bundle" else "multi_executable"
    comparisons_ = []
    for item in finals:
        for hint in comparisons(entry_, item["scan"], item["category"]):
            if len(finals) > 1:
                hint["target_path"] = item["target"]["path"]
            comparisons_.append(hint)
    return {**entry_, "host": urlsplit(entry_["url"]).hostname, "category": outcome,
            "comparison": comparisons_, "attempts": attempts}


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
    checked_casks = len({row["cask"] for row in rows})
    lines = [
        "# Homebrew scanner scoreboard", "",
        f"{len(rows):,}/{metadata['manifest_count']:,} artifacts checked. "
        f"{categories['verified']:,} apps, {categories['verified_executable']:,} standalone executables, "
        f"and {categories['verified_plugin']:,} installed products verified. "
        f"Run started {metadata['started_at']}.", "",
        f"Checked artifacts cover {checked_casks:,} of {metadata.get('manifest_casks', metadata['manifest_count']):,} casks.", "",
        f"Across all attempts, the CLI reported {accepted_bytes:,} bytes and {reads:,} reads. "
        f"{unmetered} attempts ended without byte counts.", "",
        "| Container | Scanned | Verified | Outcomes |", "| --- | ---: | ---: | --- |",
    ]
    for format_, counts in sorted(formats.items()):
        detail = ", ".join(f"{key} {count}" for key, count in sorted(counts.items()))
        lines.append(f"| {format_} | {sum(counts.values()):,} | {sum(counts[k] for k in VERIFIED):,} | {detail} |")
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
            label = row["cask"]
            if hint.get("target_path"):
                label += f" ({hint['target_path']})"
            lines.append("| " + " | ".join(map(cell, (label, hint["source"], ", ".join(hint["expected"]),
                                                     ", ".join(hint["observed"])))) + " |")
    lines += ["", "## Unresolved artifacts", "", "| Cask | Container | Outcome | Evidence |", "| --- | --- | --- | --- |"]
    for row in rows:
        if row["category"] in VERIFIED:
            continue
        scan = row["attempts"][-1]["scan"]
        evidence = scan.get("error") or f"app registration {row['declared_apps']}, scanner bundle {scan.get('bundle_path')}"
        if row["category"] in {"multi_app", "multi_executable"}:
            per_target = {record["target"]["path"]: record["category"] for record in row["attempts"] if record.get("target")}
            if per_target:
                evidence = f"Individual targets {per_target}. All must verify with one shared strong ETag."
        if scan.get("source_transport") == "stream":
            evidence += f"; HTTP 200 body, {scan.get('source_content_type') or 'no Content-Type'}"
        lines.append("| " + " | ".join(map(cell, (row["cask"], scan.get("format") or row["expected_format"],
                                                 row["category"], evidence))) + " |")
    dest = output / "scoreboard.md"
    temporary = dest.with_suffix(".md.tmp")
    temporary.write_text("\n".join(lines) + "\n")
    temporary.replace(dest)


def republish(args):
    with scan_lock():
        metadata = load(args.output / "metadata.json")
        rows = checkpoint_rows(args.output / "checkpoint.ndjson")
        publish(args.output, metadata, rows)


def identity(row):
    return row["cask"], row["url"], row["version"], row.get("sha256")


def observations(row):
    final = row["attempts"][-1]["scan"]
    return {
        "bundle_id": final.get("bundle_id"), "version": final.get("version"),
        "min_macos": final.get("min_macos"),
        "architectures": sorted((arch["name"], arch.get("min_macos")) for arch in final.get("architectures", [])),
    }


def delta(args):
    before = {identity(row): row for row in load(args.before)["artifacts"]}
    after = {identity(row): row for row in load(args.after)["artifacts"]}
    common = [key for key in before if key in after]
    transitions = Counter((before[key]["category"], after[key]["category"]) for key in common)
    byte_deltas = []
    metadata_changes = []
    changed_validators = []
    for key in common:
        old, new = before[key], after[key]
        if old["category"] not in VERIFIED or new["category"] not in VERIFIED:
            continue
        left, right = old["attempts"][-1]["scan"], new["attempts"][-1]["scan"]
        left_tag, right_tag = left.get("source_etag"), right.get("source_etag")
        if (left_tag and right_tag and left_tag != right_tag) or left.get("total_size") != right.get("total_size"):
            changed_validators.append(old["cask"])
            continue
        if observations(old) != observations(new):
            metadata_changes.append({
                "cask": old["cask"], "strong_etag_matched": bool(left_tag and left_tag == right_tag),
                "before": observations(old), "after": observations(new),
            })
        # Compare the same result on the first tier so escalation and duplicate
        # attempts don't masquerade as a parser byte regression.
        if len(old["attempts"]) == len(new["attempts"]) == 1 and left_tag and left_tag == right_tag:
            byte_deltas.append({
                "cask": old["cask"], "before": left["bytes_read"], "after": right["bytes_read"],
                "difference": right["bytes_read"] - left["bytes_read"],
            })
    result = {
        "matched_artifacts": len(common),
        "outcome_transitions": [
            {"before": old, "after": new, "count": count} for (old, new), count in sorted(transitions.items())
        ],
        "changed_representation": changed_validators,
        "metadata_changes": metadata_changes,
        "same_validator_first_attempt_byte_deltas": sorted(byte_deltas, key=lambda row: -abs(row["difference"])),
    }
    save(args.output, result)
    print(json.dumps({
        "matched": len(common), "changed_representation": len(changed_validators),
        "metadata_changes": len(metadata_changes), "comparable_first_attempts": len(byte_deltas),
        "first_attempt_byte_delta": sum(row["difference"] for row in byte_deltas),
    }))


def annotate(args):
    manifest = load(args.manifest)
    if digest(args.catalog) != manifest["catalog_sha256"]:
        raise ValueError("Use the catalog pinned by the fixed cohort")
    catalog = {row["token"]: row for row in load(args.catalog)}
    verified = {}
    for report in args.reports:
        for row in load(report)["artifacts"]:
            if row["category"] in VERIFIED:
                verified[identity(row)] = row
    for row in manifest["entries"]:
        row["declared_binaries"] = binary_paths(catalog[row["cask"]])
        match = verified.get(identity(row))
        if match:
            row["expected_status"] = match["category"]
            row["expected_evidence"] = observations(match)
            row["expected_etag"] = match["attempts"][-1]["scan"].get("source_etag")
    save(args.output, manifest)


def scanner_commit(cli, cli_sha256):
    provenance = cli.with_name(cli.name + ".provenance.json")
    if provenance.is_file():
        recorded = load(provenance)
        if recorded.get("sha256") != cli_sha256:
            raise ValueError(f"Scanner binary does not match its provenance at {provenance}")
        commit = recorded["commit"]
        if re.fullmatch(r"[0-9a-f]{40}", commit) is None:
            raise ValueError(f"Scanner provenance lacks a full Git commit at {provenance}")
        return commit
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()


def run(args):
    args.cli = args.cli.resolve()
    if not args.cli.is_file():
        raise ValueError(f"Scanner binary missing at {args.cli}")
    if args.escalate != sorted(set(args.escalate)) or any(n <= args.budget for n in args.escalate):
        raise ValueError("Escalation budgets must be unique, increasing, and above the base budget")
    manifest = load(args.manifest)
    entries = manifest["entries"]
    if args.target_catalog is not None:
        if digest(args.target_catalog) != manifest["catalog_sha256"]:
            raise ValueError("The target catalog must match the snapshot that generated the manifest")
        catalog = {row["token"]: row for row in load(args.target_catalog)}
        entries = [
            {**row, "declared_binaries": binary_paths(catalog[row["cask"]])}
            for row in entries
        ]
    args.output.mkdir(parents=True, exist_ok=True)
    metadata_path = args.output / "metadata.json"
    parameters = {
        "manifest_sha256": digest(args.manifest), "catalog_sha256": manifest["catalog_sha256"],
        "manifest_count": len(entries),
        "manifest_casks": len({row["cask"] for row in entries}),
        "cli_sha256": digest(args.cli), "budget": args.budget, "escalate": args.escalate,
        "timeout": args.timeout, "cli_options": args.cli_option, "host_cooldown": args.host_cooldown,
        "use_cask_targets": args.use_cask_targets,
    }
    with scan_lock():
        if metadata_path.exists():
            metadata = load(metadata_path)
            if any(metadata.get(key) != value for key, value in parameters.items()):
                raise ValueError("Checkpoint uses different inputs, scanner binary, or scan policy. Choose a new output directory.")
        else:
            commit = scanner_commit(args.cli, parameters["cli_sha256"])
            metadata = {**parameters, "scanner_commit_at_start": commit, "started_at": timestamp()}
            save(metadata_path, metadata)
        checkpoint = args.output / "checkpoint.ndjson"
        rows = checkpoint_rows(checkpoint)
        if len(rows) > len(entries) or any(identity(recorded) != identity(expected) for recorded, expected in zip(rows, entries)):
            raise ValueError("Checkpoint rows do not match the pinned manifest order")
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
                    targets = scan_targets(entry_, args.use_cask_targets)
                    try:
                        row = scan_entry(args, entry_, targets)
                    except DeadlineReached:
                        print("Deadline reached. Saved completed artifacts; the interrupted artifact remains pending.", flush=True)
                        break
                    last_finished[host] = time.monotonic()
                    stream.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
                    stream.flush()
                    os.fsync(stream.fileno())
                    rows.append(row)
                    print(f"{len(rows)}/{len(entries)} {row['cask']} {row['category']}", flush=True)
                    if len(rows) % (50 if len(entries) > 500 else 10) == 0:
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
    measure.add_argument("--use-cask-targets", action="store_true")
    measure.add_argument("--target-catalog", type=Path, help="original catalog when a fixed manifest lacks binary paths")
    measure.add_argument("--stop-at", type=int, help="UNIX deadline in seconds; checkpoint completed artifacts")
    measure.set_defaults(action=run)
    publication = commands.add_parser("report", help="rebuild JSON and markdown from a durable checkpoint")
    publication.add_argument("output", type=Path)
    publication.set_defaults(action=republish)
    difference = commands.add_parser("diff", help="compare results for two runs of a pinned cohort")
    difference.add_argument("before", type=Path)
    difference.add_argument("after", type=Path)
    difference.add_argument("output", type=Path)
    difference.set_defaults(action=delta)
    expected = commands.add_parser("annotate", help="store the metadata observed for verified regression entries")
    expected.add_argument("catalog", type=Path)
    expected.add_argument("manifest", type=Path)
    expected.add_argument("output", type=Path)
    expected.add_argument("reports", type=Path, nargs="*")
    expected.set_defaults(action=annotate)
    args = parser.parse_args()
    args.action(args)


if __name__ == "__main__":
    main()

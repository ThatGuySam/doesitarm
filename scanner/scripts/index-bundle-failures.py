"""Index recorded bundle, entry-point, and uncategorized attempts for replay."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

CLASSES = {
    "plist_not_found", "metadata_missing", "bundle_path_not_found",
    "executable_not_found", "no_macho_found", "linked_executable",
    "non_macho_executable", "script_executable", "multi_executable",
    "multi_app", "unsupported_codec", "other",
}
CASES = {
    "agentsessions", "android-studio", "browserstacklocal", "cursor-cli",
    "db-browser-for-sqlcipher@nightly", "flutter", "latexit", "rolisteam",
    "rstudio", "scihubeva", "soothe2", "suuntodm5",
}
RESULT_FIELDS = (
    "format", "status", "error", "bundle_path", "bundle_kind", "bundle_id",
    "name", "version", "min_macos", "executable_name", "executable_path",
    "executable_resolution", "executable_size", "architectures", "installer",
    "nested_artifacts", "script_runtime", "source_etag", "source_transport",
    "bytes_read", "bytes_requested", "decoded_bytes", "total_size", "reads",
)
OTHER = {
    "Unknown or repeated flag.": "cli_flags",
    "not found: bundle path in HFS catalog": "hfs_path",
    "invalid data: XZ stream": "xz_stream",
    "invalid data: compressed stream ended before requested output": "compressed_stream",
    "invalid data: tar header checksum": "tar_checksum",
    "invalid data: executable is not Mach-O": "non_macho_entry",
    "invalid data: ZIP end record missing": "zip_end_record",
    "invalid data: range outside its container": "container_range",
    "scan limit: APFS checkpoint ring exceeds 128 blocks": "apfs_checkpoint_limit",
    "scan limit: scan deadline reached": "scan_deadline",
}
SECRET = re.compile(r"(?:^|[?&])(?:token|auth|key|signature|sig|jwt|password|x-amz-[^=]+)=", re.I)


def pinned_url(url):
    parts = urlsplit(url)
    if parts.username or parts.password or SECRET.search(parts.query):
        return urlunsplit((parts.scheme, parts.netloc.rsplit("@", 1)[-1], parts.path, "", ""))
    return url


def observed_result(scan):
    result = {key: scan[key] for key in RESULT_FIELDS if key in scan}
    if inventory := scan.get("inventory"):
        result["inventory"] = {
            key: value for key, value in inventory.items() if key != "binaries"
        }
        result["inventory"]["binary_count"] = len(inventory.get("binaries", []))
    return result


def group(category, error):
    if category == "other":
        first_line = (error or "").partition("\n")[0]
        return OTHER.get(first_line, "unclassified")
    return category


def ledger_rows(ledger):
    with (ledger / "attempts.jsonl").open() as stream:
        for line, raw in enumerate(stream, 1):
            row = json.loads(raw)
            cask = row.get("token")
            category = row.get("failure_class")
            if category not in CLASSES and cask not in CASES:
                continue
            result = row.get("result") or {}
            yield {
                "source": f"scan-ledger/attempts.jsonl:{line}",
                "ledger_id": row["ledger_id"],
                "token": cask,
                "original_url": pinned_url(row["original_url"]),
                "version": result.get("app_version") or result.get("version"),
                "failure_class": category,
                "group": group(category, row.get("error")),
                "error": row.get("error"),
                "settings": row.get("settings"),
                "status": row.get("status"),
                "artifact_size": row.get("artifact_size"),
                "http_status": row.get("http_status"),
                "bytes_read": row.get("bytes_read"),
                "bytes_requested": row.get("bytes_requested"),
                "reads": row.get("reads"),
                "elapsed_ms": row.get("elapsed_ms"),
                "container_format": row.get("container_format"),
                "scanner_commit": row.get("scanner_commit"),
                "scanned_at": row.get("scanned_at"),
                "repro": row.get("repro"),
                "result": observed_result(result),
                "provenance": row.get("provenance"),
            }


def campaign_rows(results):
    for path in sorted(results.glob("*/*/run.json")):
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        run = json.loads(data)
        for row, artifact in enumerate(run.get("artifacts", [])):
            cask = artifact["cask"]
            for index, attempt in enumerate(artifact.get("attempts", [])):
                category = attempt.get("category")
                if not CLASSES.intersection((category, artifact.get("category"))) and cask not in CASES:
                    continue
                scan = attempt.get("scan") or {}
                evidence = attempt.get("evidence_source")
                profile = "local" if evidence == "complete_local_download" else (
                    "remote-cli" if "budget" in attempt else None
                )
                yield {
                    "source": f"{path.relative_to(results.parent)}#/artifacts/{row}/attempts/{index}",
                    "source_sha256": digest,
                    "token": cask,
                    "original_url": pinned_url(artifact["url"]),
                    "version": artifact.get("version"),
                    "pinned_sha256": artifact.get("sha256"),
                    "expected_format": artifact.get("expected_format"),
                    "declared_apps": artifact.get("declared_apps", []),
                    "declared_binaries": artifact.get("declared_binaries", []),
                    "artifact_types": artifact.get("artifact_types", []),
                    "failure_class": category,
                    "group": group(category, scan.get("error")),
                    "artifact_outcome": artifact.get("category"),
                    "settings": {
                        "profile": profile,
                        "budget": attempt.get("budget"),
                        "target": attempt.get("target"),
                        "timeout": run.get("timeout"),
                        "cli_options": run.get("cli_options"),
                    },
                    "cli_sha256": run.get("cli_sha256"),
                    "scanner_commit": run.get("scanner_commit_at_start"),
                    "scanned_at": attempt.get("scanned_at"),
                    "elapsed_seconds": attempt.get("elapsed_seconds"),
                    "exit_code": attempt.get("exit_code"),
                    "evidence_source": evidence,
                    "download": attempt.get("download"),
                    "observed_sha256": attempt.get("sha256_observed"),
                    "result": observed_result(scan),
                }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger", type=Path)
    parser.add_argument("results", type=Path)
    args = parser.parse_args()
    for rows in (ledger_rows(args.ledger), campaign_rows(args.results)):
        for row in rows:
            print(json.dumps(row, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()

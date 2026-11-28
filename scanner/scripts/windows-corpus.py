#!/usr/bin/env python3
"""Run official download cases through the CLI using HTTP ranges only."""
import argparse
import json
import subprocess
from pathlib import Path


def report(case, cli):
    entry = dict(case)
    if not case.get("url"):
        return {**entry, "status": "page_gated"}
    run = subprocess.run(
        [cli, "scan", case["url"], "--json", "--budget", "2097152", "--deadline-ms", "35000"],
        capture_output=True, text=True, timeout=55, check=False,
    )
    try:
        result = json.loads(run.stdout)
    except json.JSONDecodeError:
        return {**entry, "status": "runner_error", "detail": run.stderr.strip()[-240:]}
    windows = result.get("windows") or {}
    detail = result.get("error")
    return {
        **entry,
        "status": result["status"],
        "transport": result.get("source_transport"),
        "size": result["total_size"] or None,
        "bytes": result["bytes_read"],
        "requested": result["bytes_requested"],
        "reads": result["reads"],
        "format": result.get("format"),
        "kind": windows.get("installer_kind"),
        "arch": windows.get("architectures", []),
        "main": windows.get("main_architecture"),
        "stub": windows.get("bootstrapper_architecture"),
        "machine": windows.get("machine"),
        "evidence": windows.get("architecture_source"),
        "payload_status": windows.get("payload_status"),
        "product": windows.get("product_name"),
        "detail": detail,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cli")
    parser.add_argument("cases", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    cases = json.loads(args.cases.read_text())
    previous = {}
    if args.resume and args.output.exists():
        previous = {entry["id"]: entry for entry in map(json.loads, args.output.read_text().splitlines())}
    with args.output.open("a" if args.resume else "w") as output:
        for case in cases:
            if case["id"] in previous:
                continue
            try:
                entry = report(case, args.cli)
            except subprocess.TimeoutExpired:
                entry = {**case, "status": "runner_timeout"}
            output.write(json.dumps(entry, ensure_ascii=False) + "\n")
            output.flush()
            print(case["id"], entry["status"], entry.get("arch"), entry.get("bytes"), flush=True)


if __name__ == "__main__":
    main()

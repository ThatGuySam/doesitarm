#!/usr/bin/env python3
"""Rebuild the edge scan manifests from the pinned CLIMB results."""

import argparse
from pathlib import Path

from climb import identity, load, save

ROOT = Path(__file__).resolve().parents[1]
BEFORE = ROOT / "results" / "climb"
VERIFIED = {"verified", "verified_executable"}
OUTCOME_FIELDS = {"attempts", "category", "comparison", "host"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    seen = set()
    for before, after in (
        ("final-regression", "regression"),
        ("final-held-out", "held-out"),
        ("full-run", "previously-failing"),
    ):
        report = load(BEFORE / before / "run.json")
        entries = []
        for row in report["artifacts"]:
            key = identity(row)
            if before == "full-run" and (row["category"] in VERIFIED or key in seen):
                continue
            seen.add(key)
            entries.append({key: value for key, value in row.items() if key not in OUTCOME_FIELDS})
        output = args.output / f"{after}.json"
        save(output, {"catalog_sha256": report["catalog_sha256"], "entries": entries})
        print(f"{output}: {len(entries)} pinned artifacts")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Verify neutral fixtures, then emit their Cargo tests into an empty directory."""
import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
import sys
import tempfile

from archives import ARM_ONLY, INTEL_FAT, INTEL_ONLY, POSITIVE, UNIVERSAL, generate


@dataclass(frozen=True)
class Case:
    name: str
    artifact: str
    format: str
    architectures: tuple
    budget: int = 131_072
    status: str = "complete"
    bundle: str | None = None
    nested: bool = False
    candidates: tuple = ()
    baseline: str | None = None
    previous_error: str | None = None


CASES = [
    Case("soothe2_product", "soothe2", "pkg", UNIVERSAL, baseline="container",
         previous_error="not found: app Info.plist in sequential archive"),
    Case("aqua_budget", "aqua", "tar.gz", (), 16_384, "budget_exhausted", bundle="Fixture.app"),
    Case("aqua_full", "aqua", "tar.gz", INTEL_FAT, bundle="Fixture.app"),
    Case("insta360_budget", "insta360", "pkg", (), 16_384, "budget_exhausted", candidates=UNIVERSAL),
    Case("insta360_full", "insta360", "pkg", UNIVERSAL),
    Case("mpp_budget", "mpp", "pkg", (), 16_384, "budget_exhausted"),
    Case("mpp_full", "mpp", "pkg", ARM_ONLY),
    Case("fabfilter_nested", "fabfilter", "dmg", UNIVERSAL, nested=True, baseline="container",
         previous_error="not found: app Info.plist in sequential archive"),
    Case("rstudio_resource_fork", "rstudio", "dmg", UNIVERSAL, baseline="container",
         previous_error="unsupported: APFS decmpfs-compressed file"),
    Case("qt_solid", "qt", "7z", ARM_ONLY, baseline="edge",
         previous_error="unsupported: unrecognized file format"),
    Case("universal_xz_dictionary", "ammonite", "tar.xz", UNIVERSAL, baseline="edge",
         previous_error="invalid data: XZ stream"),
    Case("intel_xz_dictionary", "wine", "tar.xz", INTEL_ONLY, baseline="edge",
         previous_error="invalid data: XZ stream"),
    Case("empoche_zip_trailer", "empoche", "zip", INTEL_ONLY, 262_144, baseline="edge",
         previous_error="invalid data: ZIP end record missing"),
    Case("gingko_zip_trailer", "gingko", "zip", INTEL_ONLY, 262_144, baseline="edge",
         previous_error="invalid data: ZIP end record missing"),
    Case("steam_prefixed_zip", "steam", "zip", UNIVERSAL, nested=True, baseline="edge",
         previous_error="unsupported: unrecognized file format"),
    Case("jumper_zip32", "jumper", "zip", UNIVERSAL, baseline="container",
         previous_error="invalid data: ZIP central directory entry"),
    Case("jabra_nested_budget", "jabra", "dmg", (), 19_600, "budget_exhausted",
         bundle="Fixture.app", nested=True),
    Case("jabra_declared_app", "jabra", "dmg", UNIVERSAL, bundle="Fixture.app", nested=True),
    Case("xampp_rock_ridge", "xampp", "dmg", (), status="unsupported", baseline="container",
         previous_error="invalid data: range outside its container"),
]
PASSING = (
    "calhash", "licecap", "rocks-n-diamonds", "appvolume", "motu",
    "color-oracle", "mx-power-gadget", "alfred", "browserstacklocal", "notion",
)


def read_json(cli, *args, check=True):
    run = subprocess.run([cli, *map(str, args)], check=check, text=True, capture_output=True)
    return json.loads(run.stdout)


def ensure_scan(scan, case):
    architectures = tuple(slice_["name"] for slice_ in scan["architectures"])
    assert (scan["status"], scan["format"], architectures) == (
        case.status, case.format, case.architectures
    ), scan
    assert all(slice_["header_verified"] for slice_ in scan["architectures"]), scan
    assert bool(scan.get("nested_artifacts")) == case.nested, scan
    if case.name == "xampp_rock_ridge":
        assert scan["error"] == "unsupported: declared executable is a script", scan
    if case.name == "jabra_nested_budget":
        assert scan["installer"]["package_id"] == "org.doesitarm.fixture", scan
    if case.candidates:
        candidates = scan["candidate_executables"]
        assert len(candidates) == 1, scan
        slices = candidates[0]["architectures"]
        assert tuple(slice_["name"] for slice_ in slices) == case.candidates, scan
        assert all(slice_["header_verified"] for slice_ in slices), scan


def bake(cli, source, name, out, scratch, flags=()):
    trace = scratch / "recorded.shim"
    reduced = scratch / "reduced.shim"
    original = read_json(cli, "shim", "record", source, "--out", trace, *flags)
    assert read_json(cli, "shim", "replay", trace) == original["outcome"]
    slim = read_json(cli, "shim", "reduce", trace, "--out", reduced, "--attempts", 768)
    assert read_json(cli, "shim", "replay", reduced) == original["outcome"]
    source_file = out / f"{name}.rs"
    subprocess.run([cli, "shim", "emit", reduced, "--out", source_file],
                   check=True, stdout=subprocess.DEVNULL)
    size = sum(path.stat().st_size for path in (source_file, source_file.with_suffix(".shim")) if path.exists())
    print(json.dumps({
        "case": name, "input_bytes": original["original_bytes"],
        "trace_bytes": original["compressed_bytes"], "reduced_bytes": slim["compressed_bytes"],
        "emitted_bytes": size, "outcome": slim["outcome"],
    }), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--edge-baseline", type=Path)
    parser.add_argument("--container-baseline", type=Path)
    parser.add_argument("--warp-kit", required=True, type=Path)
    args = parser.parse_args()
    cli = args.cli.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if any(out.iterdir()):
        parser.error("--out must be an empty directory")
    cache = Path.home() / ".cache/doesitarm-shims"
    cache.mkdir(parents=True, exist_ok=True)

    positives = [
        Case(name.replace("-", "_") + "_pass", name, POSITIVE[name][0], POSITIVE[name][1])
        for name in PASSING
    ]
    for case in [*CASES, *positives]:
        with tempfile.TemporaryDirectory(dir=cache) as directory:
            scratch = Path(directory)
            source = scratch / "fixture"
            generate(case.artifact, source)
            flags = ["--profile", "remote-cli", "--budget", str(case.budget)]
            if case.bundle:
                flags += ["--bundle-path", case.bundle]
            if case.artifact in {"notion", "slack"}:
                flags += ["--binary-path", "FixtureBinary"]
            baseline = {"edge": args.edge_baseline, "container": args.container_baseline}.get(case.baseline)
            if baseline:
                old = read_json(baseline.resolve(), "scan", source, "--json", *flags, check=False)
                assert old["error"] == case.previous_error, (case.name, old)
                print(f"{case.name} before fix: {old['error']}", file=sys.stderr)
            ensure_scan(read_json(cli, "scan", source, "--json", *flags, check=False), case)
            bake(cli, source, case.name, out, scratch, flags)

    with tempfile.TemporaryDirectory(dir=cache) as directory:
        bake(cli, args.warp_kit.resolve(), "warp_http_404", out, Path(directory))


if __name__ == "__main__":
    main()

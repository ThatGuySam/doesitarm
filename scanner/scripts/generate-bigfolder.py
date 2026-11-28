#!/usr/bin/env python3
"""Build an independent ground-truth Applications tree for the browser benchmark."""

import argparse
import base64
import json
import os
import plistlib
import struct
from pathlib import Path


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
APP_COUNTS = {10_000: 100, 100_000: 600, 300_000: 1800, 500_000: 3000}
NESTED_LOCATIONS = (
    "Frameworks", "Library/LoginItems", "XPCServices", "Helpers", "PlugIns", "Resources"
)
FAT = (FIXTURES / "fat.macho").read_bytes()
FAT_INTEL_OFFSET, FAT_INTEL_SIZE = struct.unpack_from(">II", FAT, 16)
BINARIES = {
    "thin": ((FIXTURES / "thin.macho").read_bytes(), ["arm64e"]),
    "fat": (FAT, ["arm64e", "x86_64"]),
    "intel": (FAT[FAT_INTEL_OFFSET:FAT_INTEL_OFFSET + FAT_INTEL_SIZE], ["x86_64"]),
}


class Tree:
    def __init__(self, root, include_file_list):
        self.root = root
        self.files = 0
        self.bytes = 0
        self.results = []
        self.symlinks = []
        self.directories = {root}
        self.file_list = [] if include_file_list else None

    def ensure_directory(self, path):
        if path in self.directories:
            return
        self.ensure_directory(path.parent)
        path.mkdir()
        self.directories.add(path)

    def write(self, path, data):
        dest = self.root / path
        self.ensure_directory(dest.parent)
        dest.write_bytes(data)
        self.files += 1
        self.bytes += len(data)
        if self.file_list is not None:
            self.file_list.append([self.display_path(path), base64.b64encode(data).decode("ascii")])

    def display_path(self, path):
        return f"{self.root.name}/{path}"

    def record(self, path, status, arch, parent=None, role=None):
        result = {"display_path": self.display_path(path), "status": status, "architectures": arch}
        if parent:
            result["parent_bundle_path"] = self.display_path(parent)
        if role:
            result["bundle_role"] = role
        self.results.append(result)

    def app(self, path, binary="thin", *, encoding="xml", case=None, index=None, parent=None):
        app = Path(path)
        name = app.stem
        plist = {
            "CFBundleIdentifier": f"org.doesitarm.synthetic.{index if index is not None else case or 'nested'}",
            "CFBundleName": name,
            "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": "3.8.2",
            "LSMinimumSystemVersion": "14.0",
            "NestedTestValue": {"unicode": ["🧪", "雪"], "boolean": True, "integer": 42},
        }
        launcher = name
        if case not in {"no-key", "implied", "wrapper", "resource-only"}:
            plist["CFBundleExecutable"] = launcher
        if case == "resource-only":
            plist["CFBundlePackageType"] = "BNDL"
        if case == "no-key":
            plist["CFBundleIdentifier"] = "com.example.AgentSessionsLike"
        fmt = plistlib.FMT_BINARY if encoding == "binary" else plistlib.FMT_XML
        data = plistlib.dumps(plist, fmt=fmt)
        if encoding == "bom":
            data = b"\xef\xbb\xbf" + data
        self.write(app / "Contents/Info.plist", data)

        role = "nested_app" if parent else "app"
        if case in {"no-key", "missing", "wrapper", "resource-only"}:
            role = {"wrapper": "wrapper", "resource-only": "resource_only"}.get(case, role)
            self.record(path, "no_executable", [], parent, role)
            self.write(app / "Contents/Resources/en.lproj/InfoPlist.strings", b'"CFBundleName" = "Localized";\n')
        elif case == "script":
            self.write(app / "Contents/MacOS" / launcher, b"#!/bin/sh\nexit 0\n")
            self.record(path, "script", [], parent, role)
        else:
            binary_data, arch = BINARIES[binary]
            self.write(app / "Contents/MacOS" / launcher, binary_data)
            self.record(path, "complete", arch, parent, role)

    def fillers(self, path, count):
        target = self.root / path
        self.ensure_directory(target)
        directory_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for index in range(count):
                fd = os.open(f"cache-{index:06}.dat", os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                             0o600, dir_fd=directory_fd)
                os.close(fd)
        finally:
            os.close(directory_fd)
        self.files += count
        if self.file_list is not None:
            self.file_list.append([self.display_path(path), count])

    def symlink(self, path, target):
        (self.root / path).symlink_to(target)
        self.symlinks.append({"path": self.display_path(path), "target": target})


def generate(parent, target_files, include_file_list=False, include_symlinks=True):
    budget = os.statvfs(parent)
    if budget.f_bavail * budget.f_frsize < 3 * 1024 ** 3:
        raise SystemExit("Fixture generation needs 3 GiB available on the test filesystem.")
    if budget.f_files and budget.f_favail < 600_000:
        raise SystemExit("Fixture generation needs 600,000 available inodes.")

    tree = Tree(parent / "Applications", include_file_list)
    tree.root.mkdir()
    for path, case in [
        ("Missing Key.app", "no-key"), ("Missing File.app", "missing"),
        ("Launcher Script.app", "script"), ("Container.app", "wrapper"),
        ("Language Assets.app", "resource-only"),
    ]:
        tree.app(path, case=case)
    tree.app("Container.app/Wrapper/Catalyst App.app", "fat", encoding="binary", parent="Container.app")
    tree.app("Espaço : 雪🧪.app", "fat", encoding="bom")
    tree.app("Implicit Launcher.app", "thin", case="implied")
    runtime = "Espaço : 雪🧪.app/Contents/Frameworks/SuiteRuntime"
    tree.write(runtime, BINARIES["intel"][0])
    tree.record(runtime, "complete", ["x86_64"], parent="Espaço : 雪🧪.app")
    helper = "Espaço : 雪🧪.app/Contents/MacOS/Secondary Helper"
    tree.write(helper, BINARIES["intel"][0])
    tree.record(helper, "complete", ["x86_64"], parent="Espaço : 雪🧪.app")
    deep = "/".join(f"deep-folder-{index:03}" for index in range(84))
    tree.app(f"Developer/{deep}/Deep App.app", "intel")
    tree.write(".DS_Store", b"")
    tree.write("Utilities/Tools/README.bin", b"ordinary data without a Mach-O header\n")
    tree.write("Utilities/Tools/tool without suffix", BINARIES["intel"][0])
    tree.record("Utilities/Tools/tool without suffix", "complete", ["x86_64"])
    for name in ("stored.zip", "hfsx.dmg", "gzip-newc.pkg"):
        path = f"Utilities/Installers/{name}"
        tree.write(path, (FIXTURES / name).read_bytes())
        tree.record(path, "complete", ["arm64e", "x86_64"])

    apps = []
    for index in range(APP_COUNTS[target_files]):
        app = f"Suites/Suite {index // 25:03}/Product {index:04}.app"
        architecture = ("thin", "fat", "intel")[index % 3]
        encoding = ("xml", "binary", "bom")[index % 3]
        tree.app(app, architecture, encoding=encoding, index=index)
        apps.append(app)
        if index % 10 == 0:
            location = NESTED_LOCATIONS[(index // 10) % len(NESTED_LOCATIONS)]
            tree.app(f"{app}/Contents/{location}/Helper {index:04}.app", architecture, parent=app)

    dense = (target_files - tree.files) // 4
    tree.fillers("Container.app/Contents/Resources/large directory", dense)
    per_app, bonus = divmod(target_files - tree.files, len(apps))
    for index, app in enumerate(apps):
        tree.fillers(f"{app}/Contents/Resources/assets", per_app + int(index < bonus))

    if include_symlinks:
        tree.symlink("directory-cycle", ".")
        tree.symlink("Utilities/up-cycle", "..")
        tree.symlink("Duplicate.app", apps[0])
        tree.symlink("Dangling.app", "no-such-bundle")
    assert tree.files == target_files
    assert tree.files + len(tree.directories) + len(tree.symlinks) + 1 + include_file_list <= 600_000
    assert tree.bytes <= 3 * 1024 ** 3
    manifest = {
        "files": tree.files, "directories": len(tree.directories), "logical_bytes": tree.bytes,
        "results": tree.results, "symlinks": tree.symlinks,
    }
    (parent / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    if tree.file_list is not None:
        (parent / "file-list.json").write_text(json.dumps(tree.file_list, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parent", type=Path, help="Existing scratch directory for Applications and its manifest")
    parser.add_argument("files", type=int, choices=APP_COUNTS)
    parser.add_argument("--file-list", action="store_true", help="Write the browser-generated FileList recipe")
    parser.add_argument("--no-symlinks", action="store_true", help="Isolate native picker behavior without links")
    args = parser.parse_args()
    generate(args.parent, args.files, args.file_list, not args.no_symlinks)

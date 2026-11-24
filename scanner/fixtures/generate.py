#!/usr/bin/env python3
"""Generate small, deterministic macOS archive fixtures without Apple tools."""
import plistlib
import zipfile
from pathlib import Path
from struct import pack

ROOT = Path(__file__).resolve().parent
ARM = 0x0100000C
INTEL = 0x01000007


def thin(cpu=ARM, subtype=2, *, legacy=False, big=False):
    order = ">" if big else "<"
    if legacy:
        commands = pack(order + "4I", 0x24, 16, 0x000A0F07, 0)
    else:
        commands = pack(order + "6I", 0x32, 24, 1, 0x000D0100, 0, 0)
        commands += pack(order + "4I", 0x1D, 16, 0, 0)
    return pack(order + "8I", 0xFEEDFACF, cpu, subtype, 2,
                1 if legacy else 2, len(commands), 0, 0) + commands


def fat(wide=False):
    # Keep Intel first in the index, and ARM first on disk.
    arm = thin()
    intel = thin(INTEL, 3, legacy=True, big=True)
    header = pack(">2I", 0xCAFEBABF if wide else 0xCAFEBABE, 2)
    for cpu, sub, offset, data in [(INTEL, 3, 1024, intel), (ARM, 2, 512, arm)]:
        if wide:
            header += pack(">IIQQII", cpu, sub, offset, len(data), 0, 0)
        else:
            header += pack(">IIIII", cpu, sub, offset, len(data), 0)
    return (header.ljust(512, b"\0") + arm).ljust(1024, b"\0") + intel


BUNDLE = "Fixture.app"
INFO = f"{BUNDLE}/Contents/Info.plist"
EXECUTABLE = f"{BUNDLE}/Contents/MacOS/FixtureBinary"
METADATA = {
    "CFBundleIdentifier": "org.doesitarm.fixture",
    "CFBundleShortVersionString": "4.2",
    "CFBundleName": "Scanner Fixture",
    "CFBundleExecutable": "FixtureBinary",
    "LSMinimumSystemVersion": "11.0",
}


def zip_fixture(path, method, *, zip64=False, binary_plist=False):
    data = plistlib.dumps(METADATA, fmt=plistlib.FMT_BINARY if binary_plist else plistlib.FMT_XML)
    previous = zipfile.ZIP64_LIMIT
    try:
        if zip64:
            zipfile.ZIP64_LIMIT = 64
        with zipfile.ZipFile(path, "w", compression=method) as archive:
            files = [
                ("__MACOSX/" + INFO, b"resource fork"),
                (BUNDLE + "/Contents/Helpers/Other.app/Contents/Info.plist", b"nested"),
                (INFO, data),
                (EXECUTABLE, fat()),
            ]
            for name, content in files:
                entry = zipfile.ZipInfo(name)
                entry.compress_type = method
                archive.writestr(entry, content)
            if zip64:
                archive.comment = b"ZIP64 comment with false signature PK\x05\x06."
    finally:
        zipfile.ZIP64_LIMIT = previous


if __name__ == "__main__":
    (ROOT / "thin.macho").write_bytes(thin())
    (ROOT / "fat.macho").write_bytes(fat())
    (ROOT / "fat64.macho").write_bytes(fat(wide=True))

    zip_fixture(ROOT / "stored.zip", zipfile.ZIP_STORED)
    zip_fixture(ROOT / "deflated-zip64.zip", zipfile.ZIP_DEFLATED, zip64=True, binary_plist=True)

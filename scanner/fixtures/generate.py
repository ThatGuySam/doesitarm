#!/usr/bin/env python3
"""Generate small, deterministic macOS archive fixtures without Apple tools."""
import gzip
import io
import plistlib
import random
import tarfile
import zipfile
from pathlib import Path
from struct import pack

from apfs_fixture import apfs_fixture
from dmg_fixture import dmg_fixture
from pkg_fixture import late_bom_fixture, pkg_fixture

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


def fat(wide=False, intel_offset=1024):
    # Keep Intel first in the index, and ARM first on disk.
    arm = thin()
    intel = thin(INTEL, 3, legacy=True, big=True)
    header = pack(">2I", 0xCAFEBABF if wide else 0xCAFEBABE, 2)
    for cpu, sub, offset, data in [(INTEL, 3, intel_offset, intel), (ARM, 2, 512, arm)]:
        if wide:
            header += pack(">IIQQII", cpu, sub, offset, len(data), 0, 0)
        else:
            header += pack(">IIIII", cpu, sub, offset, len(data), 0)
    return (header.ljust(512, b"\0") + arm).ljust(intel_offset, b"\0") + intel


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


def tar_fixture(path, *, binary_first=False, long_path=False):
    prefix = (("nested-" * 16) + "/") if long_path else ""
    binary = (prefix + EXECUTABLE, fat())
    info = (prefix + INFO, plistlib.dumps(METADATA))
    files = [binary, info] if binary_first else [info, binary]
    files.insert(1, (prefix + BUNDLE + "/Contents/MacOS/not-the-main", thin(INTEL, 3)))
    files.append(("unread-tail", random.Random(55).randbytes(90_000)))
    with open(path, "wb") as disk, gzip.GzipFile(filename="", fileobj=disk, mode="wb", mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for name, data in files:
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))



if __name__ == "__main__":
    (ROOT / "thin.macho").write_bytes(thin())
    (ROOT / "fat.macho").write_bytes(fat())
    (ROOT / "fat64.macho").write_bytes(fat(wide=True))

    zip_fixture(ROOT / "stored.zip", zipfile.ZIP_STORED)
    zip_fixture(ROOT / "deflated-zip64.zip", zipfile.ZIP_DEFLATED, zip64=True, binary_plist=True)

    tar_fixture(ROOT / "app.tar.gz")
    tar_fixture(ROOT / "app-binary-first.tar.gz", binary_first=True, long_path=True)

    dmg_fixture(ROOT / "hfsx.dmg", METADATA, fat(intel_offset=4096))
    pkg_fixture(ROOT / "gzip-newc.pkg", INFO, EXECUTABLE, METADATA, fat())
    pkg_fixture(ROOT / "stored-odc.pkg", INFO, EXECUTABLE, METADATA, fat(), odc=True)
    apfs_fixture(ROOT / "apfs.dmg", METADATA, fat(intel_offset=4096))
    pkg_fixture(ROOT / "pbzx.pkg", INFO, EXECUTABLE, METADATA, fat(), pbzx=True)
    late_bom_fixture(ROOT / "late-bom.pkg", INFO, EXECUTABLE, METADATA, fat())

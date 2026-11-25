#!/usr/bin/env python3
"""Generate small, deterministic macOS archive fixtures without Apple tools."""
import bz2
import gzip
import io
import plistlib
import random
import tarfile
import tempfile
import zipfile
import zlib
from pathlib import Path
from struct import pack

from apfs_fixture import apfs_fixture
from dmg_fixture import dmg_fixture, hfs_volume, pkg_dmg_fixture, sparse_apm_fixture, write_udif
from iso_fixture import iso_dmg_fixture
from pkg_fixture import cpio, late_bom_fixture, pkg_fixture, write_xar

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


def tar_codec_fixtures():
    import lzma

    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w") as archive:
        for name, content in [
            ("padding", b"N" * (128 * 1024)),
            (INFO, plistlib.dumps(METADATA)),
            (EXECUTABLE, fat()),
        ]:
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
    payload = data.getvalue()
    (ROOT / "app.tar").write_bytes(payload)
    (ROOT / "app.tar.bz2").write_bytes(bz2.compress(payload))
    (ROOT / "app.tar.xz").write_bytes(lzma.compress(payload))


if __name__ == "__main__":
    (ROOT / "thin.macho").write_bytes(thin())
    (ROOT / "fat.macho").write_bytes(fat())
    (ROOT / "fat64.macho").write_bytes(fat(wide=True))

    zip_fixture(ROOT / "stored.zip", zipfile.ZIP_STORED)
    zip_fixture(ROOT / "deflated-zip64.zip", zipfile.ZIP_DEFLATED, zip64=True, binary_plist=True)

    tar_fixture(ROOT / "app.tar.gz")
    tar_fixture(ROOT / "app-binary-first.tar.gz", binary_first=True, long_path=True)
    tar_codec_fixtures()
    zip_fixture(ROOT / "bzip2.zip", zipfile.ZIP_BZIP2, binary_plist=True)
    zip_fixture(ROOT / "lzma.zip", zipfile.ZIP_LZMA, binary_plist=True)

    dmg_fixture(ROOT / "hfsx.dmg", METADATA, fat(intel_offset=4096))
    sparse_apm_fixture(ROOT / "apm.sparseimage", METADATA, fat(intel_offset=4096))
    wrapped = hfs_volume(METADATA, fat(intel_offset=4096), wrapper="Suite")
    write_udif(ROOT / "wrapped-hfs.dmg", wrapped, [(0x80000005, len(wrapped) // 512, zlib.compress)],
               "Apple_HFSX")
    volume = hfs_volume(METADATA, fat(intel_offset=4096))
    write_udif(ROOT / "bzip2-prefix.dmg", volume, [
        (0x80000006, 1, bz2.compress),
        (1, len(volume) // 512 - 1, bytes),
    ], "Apple_HFS", with_preamble=False)
    pkg_fixture(ROOT / "gzip-newc.pkg", INFO, EXECUTABLE, METADATA, fat())
    pkg_fixture(ROOT / "stored-odc.pkg", INFO, EXECUTABLE, METADATA, fat(), odc=True)
    plugin = "Library/Audio/Plug-Ins/VST3/Fixture.vst3"
    plugin_payload = cpio([
        (f"{plugin}/Contents/MacOS/FixtureBinary", fat()),
        (f"{plugin}/Contents/Info.plist", plistlib.dumps(METADATA)),
    ], odc=True)
    write_xar(ROOT / "product-bundle-version.pkg", gzip.compress(plugin_payload, mtime=0),
              package_info=f'''<pkg-info identifier="org.doesitarm.fixture.vst3" install-location="/">
                <bundle-version><bundle path="./{plugin}">
                  <bundle path="./Contents/Plugins/Nested.kext"/>
                </bundle></bundle-version>
              </pkg-info>'''.encode())
    mounted_payload = cpio([
        ("Contents/MacOS/FixtureBinary", fat()),
        ("Contents/Info.plist", plistlib.dumps(METADATA)),
    ], odc=True)
    with tempfile.TemporaryDirectory() as temp:
        package = Path(temp) / "Fixture.pkg"
        write_xar(package, gzip.compress(mounted_payload, mtime=0), package_info=b'''
          <pkg-info identifier="org.doesitarm.fixture.aax" install-location="/Library/Application Support/Avid/Audio/Plug-Ins/Fixture.aaxplugin">
            <bundle path="./Contents/__Pace_Eden.bundle"/>
          </pkg-info>
        ''')
        with zipfile.ZipFile(ROOT / "mounted-plugin.zip", "w", zipfile.ZIP_STORED) as archive:
            archive.writestr(zipfile.ZipInfo(package.name), package.read_bytes())
    apfs_fixture(ROOT / "apfs.dmg", METADATA, fat(intel_offset=4096))
    apfs_fixture(ROOT / "apfs-lzvn.dmg", METADATA, fat(intel_offset=65_536), compressed=True)
    iso_dmg_fixture(ROOT / "rock-ridge.dmg", METADATA, fat())
    pkg_fixture(ROOT / "pbzx.pkg", INFO, EXECUTABLE, METADATA, fat(), pbzx=True)
    late_bom_fixture(ROOT / "late-bom.pkg", INFO, EXECUTABLE, METADATA, fat())

    pkg_dmg_fixture(ROOT / "nested-pkg.dmg", (ROOT / "gzip-newc.pkg").read_bytes())
    write_xar(ROOT / "remote-component.xar", distribution=b"""
        <installer-gui-script><title>Remote fixture</title>
          <pkg-ref id="remote">https://example.invalid/component.pkg</pkg-ref>
        </installer-gui-script>
    """)
    write_xar(ROOT / "nested-flat.pkg", nested=(ROOT / "gzip-newc.pkg").read_bytes())
    with zipfile.ZipFile(ROOT / "nested-dmg.zip", "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr(zipfile.ZipInfo("Wrapper/Fixture.dmg"), (ROOT / "hfsx.dmg").read_bytes())
    with zipfile.ZipFile(ROOT / "nested-legacy.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(zipfile.ZipInfo("Fixture.pkg/Contents/Archive.pax.gz"),
                         (ROOT / "app.tar.gz").read_bytes(), compress_type=zipfile.ZIP_DEFLATED)

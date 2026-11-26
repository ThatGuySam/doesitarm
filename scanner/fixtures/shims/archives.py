#!/usr/bin/env python3
"""Build neutral, offline inputs from the packaging shapes in SHIMS.md."""
import argparse
import gzip
import lzma
import os
from pathlib import Path
import plistlib
import subprocess
import sys
from struct import pack, unpack_from
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apfs_fixture import apfs_fixture
from dmg_fixture import hfs_tree, pkg_dmg_fixture, write_udif
from edge.generate import tar
from generate import ARM, INTEL, METADATA, thin
from pkg_fixture import cpio, encode_bom, write_xar

APP = "Fixture.app"
MAIN = "FixtureBinary"
PLIST = "Contents/Info.plist"
EXE = "Contents/MacOS/" + MAIN
UNIVERSAL = ("x86_64", "arm64")
INTEL_ONLY = ("x86_64",)
ARM_ONLY = ("arm64",)
INTEL_FAT = ("x86_64", "i386")


def macho(architectures, offsets=None):
    def slice_for(name):
        if name == "i386":
            command = pack("<4I", 0x24, 16, 0x000A0F07, 0)
            return 7, 3, pack("<7I", 0xFEEDFACE, 7, 3, 2, 1, len(command), 0) + command
        if name == "x86_64":
            return INTEL, 3, thin(INTEL, 3, legacy=True, big=True)
        subtype = 2 if name == "arm64e" else 0
        return ARM, subtype, thin(ARM, subtype)

    slices = [slice_for(name) for name in architectures]
    if len(slices) == 1:
        return slices[0][2]
    result = bytearray(pack(">2I", 0xCAFEBABE, len(slices)))
    offsets = offsets or [512 * index for index in range(1, len(slices) + 1)]
    placements = list(zip(offsets, slices, strict=True))
    image = bytearray(max(offset + len(data) for offset, (_, _, data) in placements))
    for offset, (cpu, subtype, data) in placements:
        result.extend(pack(">5I", cpu, subtype, offset, len(data), 0))
        image[offset:offset + len(data)] = data
    image[:len(result)] = result
    return bytes(image)


def app(architectures=UNIVERSAL, root=APP, *, binary_plist=False):
    encoding = plistlib.FMT_BINARY if binary_plist else plistlib.FMT_XML
    return {
        f"{root}/{PLIST}": plistlib.dumps(METADATA, fmt=encoding),
        f"{root}/{EXE}": macho(architectures),
    }


def package(out, files, *, package_info=None, odc=False, store_blocks=False, bom=None):
    member = gzip.compress(cpio(list(files.items()), odc=odc), 0 if store_blocks else 6, mtime=0)
    kwargs = {"package_info": package_info} if package_info is not None else {}
    write_xar(out, member, bom=bom, **kwargs)


def udif(out, files):
    volume = hfs_tree(files)
    write_udif(out, volume, [(0x80000005, len(volume) // 512, zlib.compress)], "Apple_HFS")


def zipped(out, files, *, method=zipfile.ZIP_DEFLATED, prefix=b"", tail=0):
    out.write_bytes(prefix)
    with zipfile.ZipFile(out, "a", method) as archive:
        for name, data in files.items():
            archive.writestr(zipfile.ZipInfo(name), data, compress_type=method)
    if tail:
        with out.open("ab") as file:
            file.write(bytes(tail))


def wrap_zip32(out):
    # Use the same split as scan-core's ZIP32-wrap regression. Seek across the
    # 4 GiB hole. Only the plist local record and central directory move.
    small = out.with_suffix(".zip")
    zipped(small, {"readme": b"fixture", **app()}, method=zipfile.ZIP_STORED)
    data = small.read_bytes()
    small.unlink()
    end = len(data) - 22
    directory, = unpack_from("<I", data, end + 16)
    member = (APP + "/" + PLIST).encode()
    central = directory
    while central < end:
        assert data[central:central + 4] == b"PK\1\2"
        name_len, extra_len, comment_len = unpack_from("<HHH", data, central + 28)
        name_at = central + 46
        if data[name_at:name_at + name_len] == member:
            break
        central = name_at + name_len + extra_len + comment_len
    else:
        raise ValueError("Fixture plist missing from the ZIP directory")
    packed, = unpack_from("<I", data, central + 20)
    location, = unpack_from("<I", data, central + 42)
    name_length, extra_length = unpack_from("<HH", data, location + 26)
    member_end = location + 30 + name_length + extra_length + packed
    wrap = 1 << 32
    with out.open("wb") as file:
        for offset, payload in [
            (0, data[:location]),
            (member_end, data[member_end:directory]),
            (wrap + location, data[location:member_end]),
            (wrap + directory, data[directory:]),
        ]:
            file.seek(offset)
            file.write(payload)


def archive_7z(out):
    # Qt uses an LZMA solid block. Pin member timestamps and deliberately put
    # an earlier member in the same generated archive.
    directory = out.parent
    files = {"preceding": b"P" * 2048, **app(ARM_ONLY)}
    for name, data in files.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        os.utime(path, (0, 0))
    subprocess.run([
        "bsdtar", "--format", "7zip", "--options", "7zip:compression=lzma1",
        "-cf", str(out), "-C", str(directory), *files,
    ], check=True)


def late_launcher(out):
    files = app(INTEL_FAT)
    binary = files.pop(f"{APP}/{EXE}")
    files[f"{APP}/Contents/Resources/asset"] = bytes(32_768)
    files[f"{APP}/{EXE}"] = binary
    out.write_bytes(gzip.compress(tar(files), 0, mtime=0))


def late_package_plist(out):
    root = f"Applications/{APP}"
    binary = macho(UNIVERSAL) + bytes(32_768)
    plist = plistlib.dumps(METADATA)
    files = {f"{root}/{EXE}": binary, f"{root}/{PLIST}": plist}
    bom = encode_bom([
        (".", 0, None), ("Applications", 1, None), (APP, 2, None),
        ("Contents", 3, None), ("MacOS", 4, None),
        (MAIN, 5, binary), ("Info.plist", 4, plist),
    ])
    package(out, files, store_blocks=True, bom=bom)


def mpp_payload(out):
    files = app(ARM_ONLY, f"Applications/{APP}")
    files = {"usr/local/share/asset": bytes(32_768), **files}
    package(out, files, store_blocks=True)


def nested_installer(out, *, plugin=False):
    pkg = out.with_suffix(".pkg")
    if plugin:
        root = "Library/Application Support/Audio/Fixture.aaxplugin"
        files = {f"./{PLIST}": plistlib.dumps(METADATA), f"./{EXE}": macho(UNIVERSAL)}
        package_info = f'<pkg-info identifier="org.doesitarm.fixture" install-location="/{root}"/>'.encode()
    else:
        root = f"Applications/{APP}"
        files = {
            **app(INTEL_ONLY, "Library/Helper.app"),
            "Library/asset": bytes(24_576),
            **app(UNIVERSAL, root),
        }
        package_info = f'<pkg-info identifier="org.doesitarm.fixture" install-location="/"><bundle path="./{root}"/></pkg-info>'.encode()
    package(pkg, files, package_info=package_info, odc=plugin, store_blocks=not plugin)
    # Jabra's outer compressed ranges consume time or budget before the
    # declared app. A stored UDIF block keeps that range cost deterministic.
    if plugin:
        pkg_dmg_fixture(out, pkg.read_bytes())
    else:
        volume = hfs_tree({"Fixture.pkg": pkg.read_bytes()})
        write_udif(out, volume, [(1, len(volume) // 512, bytes)], "Apple_HFS")


def product_package(out):
    root = "Library/Audio/Plug-Ins/VST3/Fixture.vst3"
    files = list(app(UNIVERSAL, root).items())
    metadata = f'''
        <pkg-info identifier="org.doesitarm.fixture" version="1" install-location="/">
          <bundle-version><bundle path="./{root}"/></bundle-version>
        </pkg-info>
    '''.encode()
    package(out, dict(reversed(files)), package_info=metadata, odc=True)


def xz_dictionary(out, architectures):
    out.write_bytes(lzma.compress(tar(app(architectures)), check=lzma.CHECK_CRC64,
                                  filters=[{"id": lzma.FILTER_LZMA2, "dict_size": 64 << 20}]))


def xampp_iso(out):
    from iso_fixture import iso_dmg_fixture

    iso_dmg_fixture(out, METADATA, b"#!/bin/sh\nexit 0\n")
    with out.open("r+b") as file:
        file.seek(-20, os.SEEK_END)
        file.write(bytes(8))


def generate(case, out):
    if case == "soothe2":
        product_package(out)
    elif case == "aqua":
        late_launcher(out)
    elif case == "insta360":
        late_package_plist(out)
    elif case == "mpp":
        mpp_payload(out)
    elif case == "fabfilter":
        nested_installer(out, plugin=True)
    elif case == "jabra":
        nested_installer(out)
    elif case == "rstudio":
        apfs_fixture(out, METADATA, macho(UNIVERSAL, offsets=(65_536, 512)), compressed=True)
    elif case == "qt":
        archive_7z(out)
    elif case == "jumper":
        wrap_zip32(out)
    elif case == "xampp":
        xampp_iso(out)
    elif case in XZ:
        xz_dictionary(out, XZ[case])
    elif case in ZIP_TAILS:
        zipped(out, app(INTEL_ONLY), method=zipfile.ZIP_STORED, tail=ZIP_TAILS[case])
    elif case == "steam":
        bootstrap = gzip.compress(tar(app()), mtime=0)
        zipped(out, {"Bootstrap.tar.gz": bootstrap}, prefix=bytes(20))
    else:
        format_, architectures, variant = POSITIVE[case]
        files = app(architectures, binary_plist=variant == "binary-plist")
        if format_ == "dmg":
            if variant == "apfs":
                apfs_fixture(out, METADATA, macho(architectures))
            else:
                udif(out, files)
        elif format_ == "pkg":
            package(out, files, odc=variant == "odc")
        elif format_ == "zip":
            zipped(out, files, method=zipfile.ZIP_STORED if variant == "stored" else zipfile.ZIP_DEFLATED)
        else:
            if variant == "executable":
                files = {MAIN: macho(architectures)}
            out.write_bytes(gzip.compress(tar(files), mtime=0))


XZ = {
    "ammonite": UNIVERSAL,
    "backuploupe": UNIVERSAL,
    "imageoptim": UNIVERSAL,
    "launchcontrol": UNIVERSAL,
    "wine": INTEL_ONLY,
}
ZIP_TAILS = {"empoche": 80_296, "gingko": 112_332}
POSITIVE = {
    "calhash": ("dmg", ARM_ONLY, "apfs"),
    "licecap": ("dmg", UNIVERSAL, "hfs"),
    "rocks-n-diamonds": ("dmg", INTEL_ONLY, "hfs"),
    "nutstore": ("dmg", UNIVERSAL, "apfs"),
    "appvolume": ("pkg", ARM_ONLY, "odc"),
    "motu": ("pkg", UNIVERSAL, "newc"),
    "parsec": ("pkg", UNIVERSAL, "newc"),
    "color-oracle": ("zip", INTEL_ONLY, "binary-plist"),
    "mx-power-gadget": ("zip", ARM_ONLY, "stored"),
    "alfred": ("tar.gz", UNIVERSAL, "app"),
    "browserstacklocal": ("tar.gz", INTEL_ONLY, "app"),
    "notion": ("tar.gz", ARM_ONLY, "executable"),
    "slack": ("tar.gz", ARM_ONLY, "executable"),
    "stillcolor": ("zip", UNIVERSAL, "stored"),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    generate(args.case, args.output.resolve())


if __name__ == "__main__":
    main()

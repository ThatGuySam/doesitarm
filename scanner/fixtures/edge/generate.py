#!/usr/bin/env python3
"""Recreate inspected packaging shapes, with synthetic executable headers."""
import bz2
import gzip
import io
import lzma
from pathlib import Path
import plistlib
import subprocess
import sys
from struct import pack, pack_into
import tarfile
import tempfile
import zipfile
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate import INTEL, METADATA, fat, thin
from pkg_fixture import cpio, write_xar
from apfs_fixture import apfs_fixture
from dmg_fixture import hfs_tree, pkg_dmg_fixture, write_udif


def app(name, executable=None, **metadata):
    stem = name.rsplit("/", 1)[-1].removesuffix(".app")
    executable = executable or stem
    return {
        f"{name}/Contents/Info.plist": plistlib.dumps(
            {**METADATA, "CFBundleName": stem, "CFBundleExecutable": executable, **metadata}
        ),
        f"{name}/Contents/MacOS/{executable}": fat(),
    }


def tar(files, *, split=None):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for path, content in files.items():
            entry = tarfile.TarInfo(path)
            entry.mode = 0o755
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
    payload = data.getvalue()
    return (payload[:split], payload[split:]) if split is not None else payload


def sevenz(files, output, *, codec="lzma2"):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for name, data in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        subprocess.run(
            ["bsdtar", "--format", "7zip", "--options", f"7zip:compression={codec}",
             "-cf", str(output), "-C", directory, *files],
            check=True,
        )


def runtime_files(root):
    return {
        f"{root}/Contents/MacOS/helper": thin(),
        f"{root}/Contents/Frameworks/F.framework/Versions/A/F": thin(),
        f"{root}/Contents/Frameworks/libExample.dylib": thin(),
        f"{root}/Contents/Frameworks/Sparkle.framework/Versions/B/Updater.app/Contents/MacOS/Updater": thin(),
        f"{root}/Contents/PlugIns/AddOn.appex/Contents/MacOS/AddOn": thin(),
        f"{root}/Contents/XPCServices/Agent.xpc/Contents/MacOS/Agent": thin(),
        f"{root}/Contents/Library/LoginItems/Login.app/Contents/MacOS/Login": thin(),
        f"{root}/Contents/Library/LaunchServices/com.example.agent": thin(),
        f"{root}/Contents/Library/LaunchDaemons/daemon": thin(),
        f"{root}/Contents/Helpers/Nested.app/Contents/MacOS/Nested": thin(),
        f"{root}/Contents/Resources/Java.class": bytes.fromhex("cafebabe000000410002010003616263"),
        f"{root}/Contents/Resources/tool": thin(),
        f"{root}/Contents/SharedSupport/daemon": thin(),
        f"{root}/Contents/jbr/Contents/Home/bin/java": thin(INTEL, 3, legacy=True),
        f"{root}/Contents/jbr/Contents/Home/lib/server/libjvm.dylib": thin(INTEL, 3, legacy=True),
    }


def generate(mode, name, output):
    if mode == "xz64":
        root = name + ".app"
        executable = "wine" if name == "Wine Stable" else name
        files = {**app(root, executable), f"{root}/Contents/Frameworks/Local.framework/Versions/A/Local": thin()}
        payload = lzma.compress(tar(files), check=lzma.CHECK_CRC64,
                                filters=[{"id": lzma.FILTER_LZMA2, "dict_size": 64 << 20}])
    elif mode == "bzip2-multistream":
        root = "MailMate.app"
        files = {f"{root}/Contents/Resources/preceding-data": bytes(960_000), **app(root)}
        payload = b"".join(bz2.compress(part) for part in tar(files, split=900_000))
    elif mode == "contents-relative":
        root = "BrowserStackLocal.app"
        files = app(root, "MacOS/BrowserStackLocal.app")
        files[f"{root}/Contents/MacOS/BrowserStackLocal.app"] = thin(INTEL, 3, legacy=True)
        del files[f"{root}/Contents/MacOS/MacOS/BrowserStackLocal.app"]
        payload = gzip.compress(tar(files), mtime=0)
    elif mode == "7z-app":
        return sevenz(app("Qt Design Studio.app"), output, codec="lzma1")
    elif mode == "7z-pkg":
        with tempfile.TemporaryDirectory() as directory:
            pkg = Path(directory) / "PL2303HXD_G_Mac Driver_v2.2.11_20250314.pkg"
            files = {
                **app("Applications/PL2303Serial.app"),
                "./Library/Extensions/Prolific.kext/Contents/MacOS/Prolific": thin(),
            }
            write_xar(pkg, cpio(list(files.items()), odc=False))
            return sevenz({pkg.name: pkg.read_bytes()}, output)
    elif mode == "zstd":
        payload = tar({"codeql/codeql": b"#!/bin/sh\nexit 0\n", "codeql/tools/codeql.jar": b"jar"})
        packed = subprocess.check_output(["zstd", "-q", "--no-content-size", "-c"], input=payload)
        # Streaming frame, checksum, no dictionary ID, and 128 MiB advertised window.
        assert packed[:5] == bytes.fromhex("28b52ffd04"), packed[:6]
        output.write_bytes(packed[:5] + b"\x88" + packed[6:])
        return
    elif mode == "cursor-script":
        payload = gzip.compress(tar({
            "dist-package/cursor-agent": b'#!/usr/bin/env bash\nSCRIPT_DIR="$(dirname "$(realpath "$0")")"\nNODE_BIN="$SCRIPT_DIR/node"\nexec -a "$0" "$NODE_BIN" "$SCRIPT_DIR/index.js" "$@"\n',
            "dist-package/node": thin(),
            "dist-package/index.js": b"// placeholder\n",
        }), mtime=0)
    elif mode == "terminal-script":
        payload = gzip.compress(tar({
            **app("terminal-browser/electron/terminal-browser.app"),
            "terminal-browser/bin/terminal-browser": b'#!/bin/sh\nSELF="$0"\nROOT="$(CDPATH= cd -- "$(dirname -- "$SELF")/.." && pwd -P)"\nexec "$ROOT/electron/terminal-browser.app/Contents/MacOS/terminal-browser" "$ROOT/cli/dist/main.js" "$@"\n',
        }), mtime=0)
    elif mode == "steam":
        output.write_bytes(bytes(20))
        with zipfile.ZipFile(output, "a", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("SteamMacBootstrapper.tar.gz", gzip.compress(tar(app("Steam.app", "steam_osx")), mtime=0))
            archive.writestr("SteamMacBootstrapper.version", b"1234\n")
        return
    elif mode == "legacy-contents":
        root = "LibreOffice Language Pack.app"
        launcher = "LibreOffice Language Pack"
        files = app(root, launcher)
        del files[f"{root}/Contents/MacOS/{launcher}"]
        files[f"{root}/Contents/{launcher}"] = b"#!/bin/sh\nexit 0\n"
        files[f"{root}/Contents/Resources/osx_install.applescript"] = b"-- stub\n"
        files[f"{root}/Contents/Resources/tarball.tar.bz2"] = bz2.compress(tar({"locale/readme": b"stub"}))
        volume = hfs_tree(files)
        write_udif(output, volume, [(0x80000007, len(volume) // 512,
                    lambda raw: b"bvx-" + pack("<I", len(raw)) + raw + b"bvx$")], "Apple_HFS")
        return
    elif mode == "nested-bzip2-xar":
        root = "Prezi Video.app"
        files = {path.removeprefix(root + "/"): data for path, data in app(root, "Prezi Video").items()}
        files["Contents/Frameworks/Sparkle.framework/Versions/A/Resources/Autoupdate.app/Contents/Info.plist"] = plistlib.dumps(METADATA)
        metadata = f'<pkg-info identifier="com.prezi.PreziCast" version="11118" install-location="/Applications/{root}"/>'
        with tempfile.TemporaryDirectory() as directory:
            pkg = Path(directory) / "Prezi_Video.pkg"
            write_xar(pkg, gzip.compress(cpio(list(reversed(list(files.items()))), odc=False), mtime=0),
                      package_info=metadata.encode(), package_info_bzip2=True)
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                with archive.open(pkg.name, "w") as member:
                    member.write(pkg.read_bytes())
                    for _ in range(33):
                        member.write(bytes(1 << 20))
        return
    elif mode == "raw-gpt":
        disk = bytearray(40 * 512)
        disk[450] = 0xee
        disk[510:512] = bytes.fromhex("55aa")
        disk[512:520] = b"EFI PART"
        pack_into("<QII", disk, 512 + 72, 2, 1, 128)
        disk[1024:1040] = bytes.fromhex("005346480000aa11aa1100306543ecac")
        volume = hfs_tree(app(name + ".app", name))
        pack_into("<QQ", disk, 1024 + 32, 40, 40 + len(volume) // 512 - 1)
        payload = disk + volume
    elif mode in ("audio-pkg", "audio-dmg"):
        root = f"Library/Audio/Plug-Ins/VST3/{name}.vst3"
        files = app(root, name, CFBundleName=name)
        metadata = f'<pkg-info identifier="org.fixture.vst3" version="1" install-location="/"><bundle path="./{root}"/></pkg-info>'
        with tempfile.TemporaryDirectory() as directory:
            pkg = Path(directory) / "Plugin.pkg"
            write_xar(pkg, gzip.compress(cpio(list(reversed(list(files.items()))), odc=False), mtime=0),
                      package_info=metadata.encode())
            if mode == "audio-dmg":
                pkg_dmg_fixture(output, pkg.read_bytes())
            else:
                output.write_bytes(pkg.read_bytes())
        return
    elif mode == "zip-trailer":
        root = name + ".app"
        with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
            for path, data in app(root, name).items():
                archive.writestr(path, data)
            archive.writestr(f"{root}/Contents/Frameworks/Helper.app/Contents/MacOS/Helper", thin())
        with output.open("ab") as file:
            file.write(bytes({"Empoche": 80296, "Gingko": 112332}[name]))
        return
    elif mode == "zip-contents-relative":
        root = "Hydrus Network.app"
        files = app(root, "MacOS/hydrus_client")
        files[f"{root}/Contents/MacOS/hydrus_client"] = thin(INTEL, 3, legacy=True)
        del files[f"{root}/Contents/MacOS/MacOS/hydrus_client"]
        with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
            for path, data in files.items():
                archive.writestr(path, data)
        return
    elif mode == "zip-symlink":
        root = "Linked.app"
        files = app(root, "launcher")
        payload = files.pop(f"{root}/Contents/MacOS/launcher")
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path, data in files.items():
                archive.writestr(path, data)
            archive.writestr(f"{root}/Contents/Frameworks/Runtime.framework/Versions/A/Runtime", payload)
            entry = zipfile.ZipInfo(f"{root}/Contents/MacOS/launcher")
            entry.create_system = 3
            entry.external_attr = 0o120777 << 16
            archive.writestr(entry, "../Frameworks/Runtime.framework/Versions/A/Runtime")
        return
    elif mode == "transport-dmg":
        volume = hfs_tree(app("baretorrent.app", "baretorrent"))
        write_udif(output, volume, [(0x80000005, len(volume) // 512, zlib.compress)], "Apple_HFS")
        return
    elif mode == "transport-zip":
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path, data in app("WordPress.com Studio.app", "Studio").items():
                archive.writestr(path, data)
        return
    elif mode == "apfs-ring":
        apfs_fixture(output, METADATA, fat(intel_offset=4096), checkpoint_slots=256)
        return
    elif mode == "mounted-pkg":
        root = "tiptoi® Manager.app"
        files = {path.removeprefix(root + "/"): data for path, data in app(root, "tiptoi® Manager").items()}
        metadata = f'<pkg-info identifier="com.ravensburger.tiptoi.TipToiBindings" version="1.0.0" install-location="/Applications/{root}"/>'
        write_xar(output, gzip.compress(cpio(list(reversed(list(files.items()))), odc=False), mtime=0),
                  package_info=metadata.encode())
        return
    elif mode == "jdk-pkg":
        root = "amazon-corretto-17.jdk"
        files = {
            **app(root, "libjli.dylib", CFBundleName="Amazon Corretto 17"),
            f"{root}/Contents/Home/bin/java": thin(),
            f"{root}/Contents/Home/lib/server/libjvm.dylib": thin(),
        }
        metadata = f'<pkg-info identifier="com.amazon.corretto.17" version="17.0.21.1.2" install-location="/Library/Java/JavaVirtualMachines/"><bundle path="./{root}"/></pkg-info>'
        write_xar(output, gzip.compress(cpio(list(files.items()), odc=False), mtime=0),
                  package_info=metadata.encode())
        return
    elif mode.startswith("inventory"):
        root = "Android Studio.app"
        files = {**app(root, "studio"), **runtime_files(root)}
        if mode == "inventory-dmg":
            volume = hfs_tree(files)
            write_udif(output, volume, [(0x80000007, len(volume) // 512,
                        lambda raw: b"bvx-" + pack("<I", len(raw)) + raw + b"bvx$")], "Apple_HFS")
        elif mode == "inventory-folder":
            for path, data in files.items():
                file = output / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
        else:
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                for path, data in files.items():
                    archive.writestr(path, data)
        return
    else:
        raise SystemExit(f"Unknown fixture mode {mode}")
    output.write_bytes(payload)


if __name__ == "__main__":
    mode, name, output = sys.argv[1:]
    generate(mode, name, Path(output).resolve())

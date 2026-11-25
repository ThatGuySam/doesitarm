"""Build compact offline reproductions using synthetic Mach-O headers."""
import gzip
from pathlib import Path
import plistlib
import sys
import zipfile

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent))
from generate import fat, thin
from dmg_fixture import hfs_tree, write_udif
from apfs_fixture import apfs_fixture

from edge.generate import app, tar


def zip_fixture(name, files, *, executable=()):
    with zipfile.ZipFile(HERE / name, "w") as archive:
        for path, data in files.items():
            entry = zipfile.ZipInfo(path)
            if path in executable:
                entry.create_system = 3
                entry.external_attr = 0o100755 << 16
            archive.writestr(entry, data)


root = "AgentSessions.app"
plist = (HERE.parent / "bigfolder/agentsessions-no-key/Info.plist").read_bytes()
files = {f"{root}/Contents/Info.plist": plist, f"{root}/Contents/MacOS/{root[:-4]}": fat()}
zip_fixture("missing-key.zip", files)
(HERE / "missing-key.tar.gz").write_bytes(gzip.compress(tar(dict(reversed(list(files.items())))), mtime=0))
volume = hfs_tree(files)
write_udif(HERE / "missing-key.dmg", volume, [(1, len(volume) // 512, bytes)], "Apple_HFS")
zip_fixture("missing-key-helper.zip", {
    f"{root}/Contents/Info.plist": plist,
    f"{root}/Contents/MacOS/Helper": thin(),
    f"{root}/Contents/MacOS/{root[:-4]}": b"#!/bin/sh\nexit 0\n",
})

root = "Sci-Hub EVA.app"
name = "Sci-Hub EVA"
metadata = {
    "CFBundleExecutable": f"MacOS/{name}",
    "CFBundleIdentifier": "tech.leovan.SciHubEVA",
    "CFBundleShortVersionString": "6.5.1",
}
files = {
    f"{root}/Contents/Info.plist": plistlib.dumps(metadata),
    f"{root}/Contents/MacOS/{name}": thin(),
}
volume = hfs_tree(files)
write_udif(HERE / "contents-relative-hfs.dmg", volume, [(1, len(volume) // 512, bytes)], "Apple_HFS")
metadata["CFBundleExecutable"] = "MacOS/FixtureBinary"
apfs_fixture(HERE / "contents-relative-apfs.dmg", metadata, fat())

wrapper = "Outer.app"
inner = f"{wrapper}/Wrapper/Inner.app"
zip_fixture("wrapped-flat.zip", {
    f"{inner}/Info.plist": (HERE.parent / "bigfolder/wrapper-nested-flat/Info.plist").read_bytes(),
    f"{inner}/Inner": thin(),
    f"{inner}/Frameworks/Sidecar.framework/Sidecar": thin(),
})

resources = {
    "A Assets.app/Contents/Info.plist": plistlib.dumps({
        "CFBundleIdentifier": "com.example.assets",
        "CFBundlePackageType": "BNDL",
    }),
    "A Assets.app/Contents/Resources/en.lproj/Localizable.strings": b'"label" = "Fixture";',
}
tool = app("Z Tool.app")
zip_fixture("resources-only.zip", resources)
zip_fixture("resources-and-app.zip", {**resources, **tool})
zip_fixture("resources-and-installer.zip", {
    **resources,
    "Installer.pkg": (HERE.parent / "gzip-newc.pkg").read_bytes(),
})
zip_fixture("independent-apps.zip", {**app("A Utility.app"), **tool})

suite = "NetLogo 7.0.4"
for name, programs in [
    ("hfs-suite.dmg", [f"{suite}/{suite}.app", f"{suite}/BehaviorSearch 7.0.4.app"]),
    ("hfs-suite-ambiguous.dmg", [f"{suite}/BehaviorSearch 7.0.4.app", f"{suite}/HubNet Client 7.0.4.app"]),
]:
    volume = hfs_tree({path: data for product in programs for path, data in app(product).items()})
    write_udif(HERE / name, volume, [(1, len(volume) // 512, bytes)], "Apple_HFS")


cli_files = {
    "Widget/bin/widget": fat(),
    "Widget/bin/libfixture.dylib": thin()[:12] + (6).to_bytes(4, "little") + thin()[16:],
    "Widget/README.txt": b"Archive documentation",
}
zip_fixture("cli-only.zip", cli_files, executable=cli_files)
(HERE / "cli-only.tar.gz").write_bytes(gzip.compress(tar(cli_files), mtime=0))
cursor_files = {
    "dist-package/node": thin(),
    "dist-package/cursor-agent": (
        b'#!/usr/bin/env bash\nSCRIPT_DIR="$(dirname "$(realpath "$0")")"\n'
        b'NODE_BIN="$SCRIPT_DIR/node"\nexec -a "$0" "$NODE_BIN" "$SCRIPT_DIR/index.js" "$@"\n'
    ),
}
(HERE / "cli-script-runtime.tar.gz").write_bytes(gzip.compress(tar(cursor_files), mtime=0))
cli_pair = {"bin/first": thin(), "bin/second": fat()}
zip_fixture("cli-ambiguous.zip", cli_pair, executable=cli_pair)

zip_fixture("resources-with-binary.zip", {
    **resources,
    "A Assets.app/Contents/Unexpected/tool": thin(),
})
zip_fixture("wrapper-with-own-launcher.zip", {
    **app(wrapper),
    f"{inner}/Info.plist": (HERE.parent / "bigfolder/wrapper-nested-flat/Info.plist").read_bytes(),
    f"{inner}/Inner": thin(),
})

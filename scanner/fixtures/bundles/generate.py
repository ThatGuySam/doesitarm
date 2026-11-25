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

from edge.generate import tar


def zip_fixture(name, files):
    with zipfile.ZipFile(HERE / name, "w") as archive:
        for path, data in files.items():
            archive.writestr(zipfile.ZipInfo(path), data)


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

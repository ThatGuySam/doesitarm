"""Build a harmless dummy "yt_dlp" wheel whose import only probes what it can reach.

Used to show what a hostile yt-dlp release could do inside doesitarm-youtube-extract.
It reads no secret values, writes nothing and only GETs https://example.com/. Never
stage or promote it: it has no PyPI attestation, so the updater would reject it anyway.

Usage: python3 -I make_probe_wheel.py OUT_DIR  ->  OUT_DIR/yt_dlp-2099.1.1-py3-none-any.whl
"""

import sys
import zipfile
from pathlib import Path

VERSION = "2099.1.1"
PROBE = r'''
import json, sys
found = {"frames": 0, "env_attrs": {}, "modules_with_env": [], "egress": None, "storage_calls": []}
frame = sys._getframe()
while frame is not None:
    found["frames"] += 1
    for name, value in list(frame.f_locals.items()):
        target = getattr(value, "env", None) if name == "self" else (value if name == "env" else None)
        if target is not None:
            try:
                found["env_attrs"][f"{frame.f_code.co_name}.{name}"] = sorted(
                    k for k in dir(target) if not k.startswith("_"))[:40]
            except Exception as err:
                found["env_attrs"][name] = repr(err)[:100]
    frame = frame.f_back
for modname, module in list(sys.modules.items()):
    if getattr(module, "env", None) is not None:
        found["modules_with_env"].append(modname)
try:
    import js
    from pyodide.ffi import run_sync
    reply = run_sync(js.fetch("https://example.com/"))
    found["egress"] = f"reached example.com: HTTP {int(reply.status)}"
except Exception as err:
    found["egress"] = f"blocked: {type(err).__name__}: {str(err)[:200]}"
raise ImportError("PROBE " + json.dumps(found))
'''


def main(out_dir):
    out = Path(out_dir) / f"yt_dlp-{VERSION}-py3-none-any.whl"
    with zipfile.ZipFile(out, "w") as wheel:
        wheel.writestr("yt_dlp/__init__.py", PROBE)
        wheel.writestr("yt_dlp/version.py", f"__version__ = '{VERSION}'\n")
        wheel.writestr(f"yt_dlp-{VERSION}.dist-info/METADATA", f"Name: yt-dlp\nVersion: {VERSION}\n")
    print(out)


if __name__ == "__main__":
    main(sys.argv[1])

"""Select which yt-dlp version this isolate imports.

The bundled wheel in python_modules/ is the fallback. Any other version is a
pure-Python wheel (a zip) whose bytes come from R2: write it to the in-memory
filesystem, put it first on sys.path and let zipimport load it. Switching
versions purges yt_dlp from sys.modules so the next import reads the new zip.
"""

import hashlib
import importlib
import sys
from pathlib import Path

WHEEL_DIR = Path("/tmp/yt-dlp-wheels")

_state = {"version": None, "source": None, "path": None}


def _purge():
    for name in [n for n in sys.modules if n == "yt_dlp" or n.startswith("yt_dlp.")]:
        del sys.modules[name]
    sys.path[:] = [p for p in sys.path if not p.startswith(str(WHEEL_DIR))]
    try:
        import zipimport
        for key in [k for k in zipimport._zip_directory_cache if str(k).startswith(str(WHEEL_DIR))]:
            del zipimport._zip_directory_cache[key]
    except Exception:
        pass
    importlib.invalidate_caches()
    import gc
    gc.collect()


def loaded():
    return dict(_state)


def wheel_cached(version, sha256):
    path = WHEEL_DIR / f"yt_dlp-{version}-{sha256[:16]}.whl"
    return path if path.exists() else None


def use_bundled():
    if _state["source"] != "bundled":
        _purge()
    import yt_dlp.version
    _state.update(version=yt_dlp.version.__version__, source="bundled", path=None)
    return _state["version"]


def use_wheel(version, sha256, data=None):
    """Import yt-dlp from a wheel. `data` may be None if the wheel is already on disk."""
    if _state["source"] == "wheel" and _state["version"] == version:
        return version
    path = wheel_cached(version, sha256)
    if path is None:
        if data is None:
            raise LookupError("wheel bytes needed")
        digest = hashlib.sha256(data).hexdigest()
        if digest != sha256:
            raise ValueError(f"wheel digest mismatch: expected {sha256}, got {digest}")
        WHEEL_DIR.mkdir(parents=True, exist_ok=True)
        path = WHEEL_DIR / f"yt_dlp-{version}-{sha256[:16]}.whl"
        path.write_bytes(data)
    _purge()
    sys.path.insert(0, str(path))
    import yt_dlp.version
    actual = yt_dlp.version.__version__
    if not str(yt_dlp.__file__).startswith(str(path)):
        _purge()
        raise ImportError(f"yt_dlp imported from {yt_dlp.__file__}, not the wheel")
    if actual != version.split(".dev")[0]:
        _purge()
        raise ImportError(f"wheel reports yt-dlp {actual}, expected {version}")
    _state.update(version=actual, source="wheel", path=str(path))
    return actual

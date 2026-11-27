"""Which yt-dlp release may be tried, and static checks on its wheel before any import.

Pure Python (CPython tests and Pyodide). Nothing here imports the wheel.
"""

import io
import re
import time
import zipfile
from urllib.parse import urlsplit

COOLDOWN_SECONDS = 3 * 24 * 3600
MAX_WHEEL_BYTES = 10 * 1024 * 1024
MAX_UNPACKED_BYTES = 40 * 1024 * 1024
# A new release may differ from the reference (bundled) wheel by this much.
SIZE_TOLERANCE = 0.25
FILE_COUNT_TOLERANCE = 0.25
WHEEL_HOST = "files.pythonhosted.org"
STABLE_RE = re.compile(r"^\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$")
FORBIDDEN_SUFFIXES = (".pth", ".so", ".pyd", ".dll", ".dylib", ".exe", ".sh", ".bat")


class WheelRejected(ValueError):
    pass


def version_key(version):
    parts = re.findall(r"\d+", str(version).split(".dev")[0])
    return tuple(int(p) for p in parts)


def is_stable(version):
    return isinstance(version, str) and bool(STABLE_RE.match(version))


def parse_iso(text):
    """PyPI upload_time_iso_8601 -> epoch seconds."""
    import calendar
    match = re.match(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)", text or "")
    if not match:
        return None
    return calendar.timegm(tuple(int(g) for g in match.groups()) + (0, 0, 0))


def pick_release(pypi_json, current_version, now=None, cooldown=COOLDOWN_SECONDS):
    """Newest stable py3-none-any wheel that is at least `cooldown` old and strictly newer
    than current_version. Returns (release or None, reason)."""
    now = time.time() if now is None else now
    releases = pypi_json.get("releases") or {}
    newest_seen = None
    for version in sorted((v for v in releases if is_stable(v)), key=version_key, reverse=True):
        if version_key(version) <= version_key(current_version):
            break
        for file in releases.get(version) or []:
            name = file.get("filename", "")
            if file.get("packagetype") != "bdist_wheel" or not name.endswith("-py3-none-any.whl") \
                    or file.get("yanked"):
                continue
            uploaded = parse_iso(file.get("upload_time_iso_8601"))
            newest_seen = newest_seen or version
            if uploaded is None or now - uploaded < cooldown:
                break  # too new; consider the previous release
            return {
                "version": version,
                "url": file["url"],
                "sha256": file["digests"]["sha256"],
                "size": file.get("size"),
                "filename": name,
                "uploaded": file.get("upload_time_iso_8601"),
            }, f"{version} is stable, newer than {current_version} and past the cooldown"
    if newest_seen:
        return None, f"{newest_seen} is newer than {current_version} but still in the {cooldown // 86400}-day cooldown"
    return None, f"no stable release newer than {current_version}"


def check_release_url(release):
    parts = urlsplit(release.get("url") or "")
    expected = f"yt_dlp-{release['version']}-py3-none-any.whl"
    if parts.scheme != "https" or parts.hostname != WHEEL_HOST or not parts.path.endswith("/" + expected) \
            or release.get("filename") != expected:
        raise WheelRejected(f"unexpected wheel URL or filename: {release.get('url')}")
    if release.get("size") and int(release["size"]) > MAX_WHEEL_BYTES:
        raise WheelRejected(f"wheel is {release['size']} bytes, over the {MAX_WHEEL_BYTES} cap")


def check_wheel(data, version, reference):
    """Static checks before the wheel is stored or imported. reference = {size, files}
    of the bundled wheel. Returns a summary dict or raises WheelRejected."""
    if len(data) > MAX_WHEEL_BYTES:
        raise WheelRejected(f"wheel is {len(data)} bytes, over the cap")
    if reference.get("size"):
        ratio = len(data) / reference["size"]
        if abs(ratio - 1) > SIZE_TOLERANCE:
            raise WheelRejected(f"wheel size {len(data)} is {ratio:.2f}x the bundled wheel")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        infos = archive.infolist()
    except zipfile.BadZipFile as err:
        raise WheelRejected(f"not a zip: {err}") from None
    allowed = ("yt_dlp/", f"yt_dlp-{version}.dist-info/", f"yt_dlp-{version}.data/data/share/")
    unpacked = 0
    for info in infos:
        name = info.filename
        if name.startswith("/") or "\\" in name or ".." in name.split("/") or "\x00" in name:
            raise WheelRejected(f"unsafe path {name!r}")
        if not name.startswith(allowed):
            raise WheelRejected(f"path outside the allowed top-level directories: {name!r}")
        if name.lower().endswith(FORBIDDEN_SUFFIXES):
            raise WheelRejected(f"forbidden file type: {name!r}")
        unpacked += info.file_size
    if unpacked > MAX_UNPACKED_BYTES:
        raise WheelRejected(f"unpacked size {unpacked} is over the cap")
    if reference.get("files"):
        ratio = len(infos) / reference["files"]
        if abs(ratio - 1) > FILE_COUNT_TOLERANCE:
            raise WheelRejected(f"{len(infos)} files is {ratio:.2f}x the bundled wheel")
    try:
        metadata = archive.read(f"yt_dlp-{version}.dist-info/METADATA").decode("utf-8", "replace")
        version_py = archive.read("yt_dlp/version.py").decode("utf-8", "replace")
    except KeyError as err:
        raise WheelRejected(f"missing {err}") from None
    headers = dict(line.split(": ", 1) for line in metadata.split("\n\n")[0].splitlines() if ": " in line)
    if headers.get("Name", "").lower().replace("_", "-") != "yt-dlp" or headers.get("Version") != version:
        raise WheelRejected(f"METADATA says {headers.get('Name')} {headers.get('Version')}")
    if f"__version__ = '{version}'" not in version_py:
        raise WheelRejected("yt_dlp/version.py does not declare this version")
    return {"files": len(infos), "unpacked": unpacked, "size": len(data)}

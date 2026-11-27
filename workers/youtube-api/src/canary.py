"""Canary suite, failure classification and the promote/rollback decision.

Pure Python: the Worker supplies the extraction functions, tests supply fakes.
"""

import re

# Real Does It ARM sources. Expected values come from native CPython yt-dlp
# 2026.11.23 on 2026-11-27 (see README). Prefix checks tolerate new items being
# appended to the end of a playlist, but not reordering of the first items.
PLAYLIST_CASES = [
    {"id": "PLaa9cZC07ZPFqjoYLZRR3kbbnJRHhlmXq", "limit": 5,
     "prefix": ["3SG5e4z-Ygg", "yLVcRkFtEcA", "IcwRflRZchU"]},
    {"id": "PLYzT4cEhhFvh9IAsuic4paA_elCqNKs3J", "limit": 5,
     "prefix": ["OnO0_Ggu0-c", "MJOE_ub2TLM", "t9SpzZ4TaNI"]},
    {"id": "PL3XJJi5sAjD1sCicSKd0irf5TnQ1KJvPm", "limit": 5,
     "prefix": ["DAow0vIM8Wo", "KaxPDuCapm8", "Raqm9YVcvYo"]},
]
VIDEO_CASES = [
    {"id": "3SG5e4z-Ygg", "title": "M1 Deep Dive", "description_chars": 638, "timestamps": 0, "tags": 13},
    {"id": "3w_8hnCalq8", "title": "11 Full Gaming Benchmarks", "description_chars": 1369, "timestamps": 12, "tags": 0},
    {"id": "ilYcHk8_QDc", "title": "AetherSX2", "description_chars": 2764, "timestamps": 15, "tags": 0},
]

BLOCKED_PATTERNS = re.compile(
    r"sign in to confirm|not a bot|login_required|http error 429|too many requests|"
    r"rate.?limit|captcha|unusual traffic|this helps protect our community|"
    r"http error 403",
    re.IGNORECASE,
)
NETWORK_PATTERNS = re.compile(
    r"timed out|timeout|transporterror|connection|network|fetch failed|"
    r"request budget|http error 5\d\d|internal error",
    re.IGNORECASE,
)

YOUTUBE_BLOCKED = "youtube_blocked"
NETWORK = "network"
UPSTREAM_BROKE = "upstream_broke"
CONTRACT = "contract"


def classify(error_text, warnings=()):
    """Map an extraction error (plus yt-dlp warnings) to a failure class."""
    text = " ".join([error_text or "", *warnings])
    if BLOCKED_PATTERNS.search(text):
        return YOUTUBE_BLOCKED
    if NETWORK_PATTERNS.search(error_text or ""):
        return NETWORK
    return UPSTREAM_BROKE


def check_playlist(case, result):
    ids = [item["id"] for item in result.get("items", [])]
    problems = []
    if len(ids) < len(case["prefix"]):
        problems.append(f"only {len(ids)} items")
    if ids[: len(case["prefix"])] != case["prefix"]:
        problems.append(f"first IDs {ids[:len(case['prefix'])]} != {case['prefix']}")
    return problems, {"ids": ids}


def check_video(case, result):
    problems = []
    title = result.get("title") or ""
    description = result.get("description") or ""
    if case["title"].lower() not in title.lower():
        problems.append(f"title {title!r} lacks {case['title']!r}")
    if len(description) < case["description_chars"] * 0.8:
        problems.append(f"description {len(description)} chars < 80% of {case['description_chars']}")
    if len(result.get("timestamps") or []) < case["timestamps"]:
        problems.append(f"{len(result.get('timestamps') or [])} timestamps < {case['timestamps']}")
    if case["tags"] and len(result.get("tags") or []) < case["tags"] * 0.5:
        problems.append(f"{len(result.get('tags') or [])} tags < half of {case['tags']}")
    return problems, {
        "title": title[:80],
        "description_chars": len(description),
        "timestamps": len(result.get("timestamps") or []),
        "tags": len(result.get("tags") or []),
        "duration": result.get("duration"),
    }


def run_suite(get_playlist, get_video, clock):
    """Run every case. get_* return (normalized_result, warnings) or raise."""
    cases = []
    for kind, specs, fetcher, checker in (
        ("playlist", PLAYLIST_CASES, lambda c: get_playlist(c["id"], c["limit"]), check_playlist),
        ("video", VIDEO_CASES, lambda c: get_video(c["id"]), check_video),
    ):
        for case in specs:
            started = clock()
            entry = {"kind": kind, "id": case["id"]}
            try:
                result, warnings = fetcher(case)
                problems, details = checker(case, result)
                entry.update(details)
                if warnings:
                    entry["warnings"] = warnings[:5]
                if problems:
                    entry["ok"] = False
                    entry["problems"] = problems
                    blocked = classify("", warnings) == YOUTUBE_BLOCKED
                    entry["class"] = YOUTUBE_BLOCKED if blocked else CONTRACT
                else:
                    entry["ok"] = True
            except Exception as err:  # noqa: BLE001 - every failure is data here
                text = f"{type(err).__name__}: {err}"
                entry.update(ok=False, error=text[:500], **{"class": classify(text)})
            entry["ms"] = round((clock() - started) * 1000)
            cases.append(entry)
    failed = [c for c in cases if not c["ok"]]
    return {
        "ok": not failed,
        "passed": len(cases) - len(failed),
        "total": len(cases),
        "failure_classes": sorted({c["class"] for c in failed}),
        "cases": cases,
    }


def same(a, b):
    return bool(a and b) and a.get("version") == b.get("version") and a.get("source") == b.get("source")


def decide(active, active_result, candidate=None, candidate_result=None,
           last_good=None, last_good_result=None):
    """Return (action, reason). action is promote | rollback | hold."""
    if candidate and candidate_result and not same(candidate, active):
        if candidate_result.get("ok"):
            return "promote", f"candidate {candidate['version']} ({candidate['source']}) passed all canaries"
    active_ok = bool(active_result and active_result.get("ok"))
    if active_ok:
        if candidate_result and not candidate_result.get("ok"):
            return "hold", f"candidate failed ({', '.join(candidate_result.get('failure_classes', []))}); active still green"
        return "hold", "active is green and there is no newer candidate"
    classes = set(active_result.get("failure_classes", [])) if active_result else {"missing"}
    if classes <= {YOUTUBE_BLOCKED, NETWORK}:
        return "hold", f"active failing for reasons outside yt-dlp ({', '.join(sorted(classes))}); not changing versions"
    if last_good and last_good_result and last_good_result.get("ok") and not same(last_good, active):
        return "rollback", f"active failing ({', '.join(sorted(classes))}) while last good {last_good['version']} passes"
    return "hold", f"active failing ({', '.join(sorted(classes))}) and no green alternative"


def version_key(version):
    parts = re.findall(r"\d+", version.split(".dev")[0])
    return tuple(int(p) for p in parts)


def pick_release(pypi_json, channel="stable"):
    """Choose the newest wheel from PyPI JSON for the channel. Returns dict or None."""
    releases = pypi_json.get("releases", {})
    if channel == "stable":
        candidates = [pypi_json.get("info", {}).get("version")]
    else:
        candidates = sorted(releases, key=version_key, reverse=True)[:5]
    for version in candidates:
        if not version:
            continue
        if channel == "stable" and ".dev" in version:
            continue
        for file in releases.get(version, []):
            if file.get("packagetype") == "bdist_wheel" and file.get("filename", "").endswith("py3-none-any.whl") \
                    and not file.get("yanked"):
                return {
                    "version": version,
                    "url": file["url"],
                    "sha256": file["digests"]["sha256"],
                    "size": file.get("size"),
                    "filename": file["filename"],
                    "uploaded": file.get("upload_time_iso_8601"),
                }
    return None

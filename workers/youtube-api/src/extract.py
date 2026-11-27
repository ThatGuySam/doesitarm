"""doesitarm-youtube-extract: runs yt-dlp and nothing else.

No bindings, no secrets, no vars, no route. Other Workers call it through a service
binding with a JSON job; it answers with JSON. A downloaded yt-dlp wheel arrives
as bytes from the caller (the bundled copy is the fallback), so this Worker never
reads storage. Callers treat every answer as untrusted and validate it.

Request body: one line of job JSON, a newline, then optional wheel bytes.
Job: {"op": "video"|"playlist"|"videos"|"canary", "wheel": {"version", "sha256"} | null,
      "player_client": "a,b" | null, ...op arguments}
If the job names a wheel this isolate does not hold and no bytes were sent, the
answer is 409 {"need_wheel": true}; the caller resends with the bytes.

Do not import yt_dlp at module scope: it calls random() at import time and
workerd forbids entropy during startup.
"""

import json
import time

from workers import Response, WorkerEntrypoint

import canary
import loader
from normalize import (
    MAX_PLAYLIST_LIMIT,
    MAX_SOURCE_PLAYLIST,
    normalize_playlist,
    normalize_video,
    valid_playlist_id,
    valid_version,
    valid_video_id,
)

MAX_BATCH = 25
JSON_HEADERS = {"content-type": "application/json; charset=utf-8"}


def reply(data, status=200):
    return Response(json.dumps(data, ensure_ascii=False), status=status, headers=JSON_HEADERS)


class CaptureLogger:
    """yt-dlp logger that keeps warnings and errors for the answer and canary."""

    def __init__(self):
        self.warnings = []

    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        if len(self.warnings) < 20:
            self.warnings.append(str(msg)[:400])

    def error(self, msg):
        self.warning(msg)


def ytdl_options(logger, extra):
    opts = {
        "cachedir": False,
        "js_runtimes": {},
        "quiet": True,
        "no_warnings": False,
        "logger": logger,
        "socket_timeout": 15,
        "retries": 0,
        "ignore_no_formats_error": True,
        "noprogress": True,
        "extractor_args": {"youtube": {
            "player_skip": ["js"],
            "skip": ["hls", "dash", "translated_subs"],
        }},
    }
    opts.update(extra)
    return opts


def run_ytdlp(url, extra_opts, max_requests, player_client=None, retries=1):
    """Run yt-dlp synchronously. Network I/O suspends through JSPI inside the adapter."""
    import transport
    handler = transport.make_handler(transport.js_fetch, max_requests=max_requests)
    ydl_class = transport.make_youtube_dl_class(handler)
    logger = CaptureLogger()
    opts = ytdl_options(logger, extra_opts)
    opts["extractor_retries"] = retries
    if player_client:
        opts["extractor_args"]["youtube"]["player_client"] = player_client.split(",")
    ydl = ydl_class(opts)
    try:
        info = ydl.extract_info(url, download=False, process=False)
        if info and info.get("_type") == "playlist":
            limit = extra_opts.get("playlistend") or 50
            items = []
            for entry in info.get("entries") or []:
                items.append(entry)
                if len(items) >= limit:
                    break
            info["entries"] = items
        return info, logger.warnings, ydl.fetch_calls()
    except Exception as err:
        err.warnings = logger.warnings
        try:
            err.calls = ydl.fetch_calls()
        except Exception:
            err.calls = []
        raise
    finally:
        ydl.close()


def get_playlist(playlist_id, limit, player_client=None):
    info, warnings, calls = run_ytdlp(
        f"https://www.youtube.com/playlist?list={playlist_id}",
        {"extract_flat": True, "playlistend": limit},
        max_requests=4 + limit // 50 * 2,
        player_client=player_client,
    )
    return normalize_playlist(info, limit), warnings, calls


def get_video(video_id, player_client=None):
    info, warnings, calls = run_ytdlp(
        f"https://www.youtube.com/watch?v={video_id}",
        {"noplaylist": True},
        max_requests=12,
        player_client=player_client,
        retries=0,
    )
    video = normalize_video(info)
    if not video.get("title"):
        err = RuntimeError("video unavailable: extraction returned no title")
        err.warnings, err.calls = warnings, calls
        raise err
    return video, warnings, calls


def failure(err):
    text = f"{type(err).__name__}: {err}"[:600]
    return {"ok": False, "error": text, "class": canary.classify(text, getattr(err, "warnings", [])),
            "requests": len(getattr(err, "calls", []) or [])}


def activate(spec, data):
    """Import the requested yt-dlp. Returns (info, need_wheel)."""
    if not spec:
        return {"version": loader.use_bundled(), "source": "bundled"}, False
    version, sha = spec.get("version"), spec.get("sha256")
    if not valid_version(version) or not isinstance(sha, str) or len(sha) != 64:
        raise ValueError("wheel spec must have a version and a sha256")
    if data is None and not loader.wheel_cached(version, sha):
        return None, True
    try:
        loader.use_wheel(version, sha, data)
        return {"version": loader.loaded()["version"], "source": "wheel", "sha256": sha}, False
    except Exception as err:  # noqa: BLE001
        return {"version": loader.use_bundled(), "source": "bundled",
                "fallback_reason": f"{type(err).__name__}: {err}"[:300]}, False


async def request_bytes(request):
    js_request = getattr(request, "js_object", request)
    buffer = await js_request.arrayBuffer()
    return buffer.to_bytes() if hasattr(buffer, "to_bytes") else bytes(buffer.to_py())


def run_job(job, ytdlp):
    op = job.get("op")
    player_client = job.get("player_client")
    if player_client is not None and (not isinstance(player_client, str) or len(player_client) > 100):
        raise ValueError("bad player_client")
    started = time.time()
    if op == "video":
        if not valid_video_id(job.get("id")):
            raise ValueError("bad video id")
        try:
            data, warnings, calls = get_video(job["id"], player_client)
            out = {"ok": True, "data": data, "warnings": len(warnings), "requests": len(calls)}
        except Exception as err:  # noqa: BLE001
            out = failure(err)
    elif op == "playlist":
        limit = job.get("limit")
        cap = MAX_SOURCE_PLAYLIST if job.get("source") else MAX_PLAYLIST_LIMIT
        if not valid_playlist_id(job.get("id")) or not isinstance(limit, int) or not 1 <= limit <= cap:
            raise ValueError("bad playlist id or limit")
        try:
            data, warnings, calls = get_playlist(job["id"], limit, player_client)
            out = {"ok": True, "data": data, "warnings": len(warnings), "requests": len(calls)}
        except Exception as err:  # noqa: BLE001
            out = failure(err)
    elif op == "videos":
        ids = job.get("ids")
        if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_BATCH or not all(map(valid_video_id, ids)):
            raise ValueError(f"ids must be 1 to {MAX_BATCH} video ids")
        results = {}
        for video_id in ids:
            try:
                data, warnings, calls = get_video(video_id, player_client)
                results[video_id] = {"ok": True, "data": data, "requests": len(calls)}
            except Exception as err:  # noqa: BLE001
                results[video_id] = failure(err)
                if results[video_id]["class"] == canary.YOUTUBE_BLOCKED and job.get("stop_when_blocked"):
                    break
        out = {"ok": True, "results": results}
    elif op == "canary":
        def playlist(pid, limit):
            data, warnings, _ = get_playlist(pid, limit)
            return data, warnings

        def video(vid):
            data, warnings, _ = get_video(vid, player_client)
            return data, warnings

        out = canary.run_suite(playlist, video, time.time)
        if ytdlp.get("fallback_reason") and job.get("wheel"):
            # The requested wheel did not load; a bundled pass must not count for it.
            out["ok"] = False
            out["failure_classes"] = sorted({*out["failure_classes"], canary.UPSTREAM_BROKE})
    else:
        raise ValueError(f"unknown op {op!r}")
    out["ytdlp"] = ytdlp
    out["elapsed_ms"] = round((time.time() - started) * 1000)
    return out


class Default(WorkerEntrypoint):

    async def fetch(self, request):
        if request.method.upper() != "POST":
            return reply({"error": "POST a job"}, 405)
        body = await request_bytes(request)
        head, _, wheel_bytes = body.partition(b"\n")
        try:
            job = json.loads(head)
            if not isinstance(job, dict):
                raise ValueError("job must be an object")
            ytdlp, need_wheel = activate(job.get("wheel"), wheel_bytes or None)
            if need_wheel:
                return reply({"need_wheel": True}, 409)
            return reply(run_job(job, ytdlp))
        except (ValueError, TypeError, KeyError) as err:
            return reply({"error": f"{type(err).__name__}: {err}"[:300]}, 400)

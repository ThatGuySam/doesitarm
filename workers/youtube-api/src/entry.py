"""Does It ARM YouTube read API: unmodified yt-dlp in a Cloudflare Python Worker.

Do not import yt_dlp at module scope: it calls random() at import time and
workerd forbids entropy during startup. loader.py imports it per request.
"""

import hmac
import json
import time
from urllib.parse import parse_qs, urlsplit

from workers import Response, WorkerEntrypoint

import canary
import loader
from normalize import (
    BadInput,
    normalize_playlist,
    normalize_video,
    parse_limit,
    require_playlist_id,
    require_video_id,
    valid_version,
)

API_VERSION = 1
VIDEO_TTL = 6 * 3600
PLAYLIST_TTL = 3600
STALE_KEEP = 30 * 24 * 3600
RUN_HISTORY = 20
CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
}
POINTER_ACTIVE = "pointer:active"
POINTER_LAST_GOOD = "pointer:last_good"
RUN_LATEST = "run:latest"
RUN_INDEX = "run:index"


# ---------------------------------------------------------------- helpers

def json_response(data, status=200, extra=None):
    headers = {"content-type": "application/json; charset=utf-8", **CORS}
    if extra:
        headers.update(extra)
    return Response(json.dumps(data, ensure_ascii=False), status=status, headers=headers)


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def to_bytes(value):
    if value is None:
        return None
    if hasattr(value, "to_bytes"):
        return value.to_bytes()
    if hasattr(value, "to_py"):
        value = value.to_py()
    return bytes(value)


async def kv_json(env, key):
    value = await env.YT_STATE.get(key)
    if not isinstance(value, str) or not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        return None


async def kv_put_json(env, key, value, ttl=None):
    if ttl:
        await env.YT_STATE.put(key, json.dumps(value), {"expirationTtl": ttl})
    else:
        await env.YT_STATE.put(key, json.dumps(value))


def bundled_pointer():
    return {"version": bundled_version(), "source": "bundled"}


def bundled_version():
    import sys
    from pathlib import Path
    for entry in sys.path:
        if entry.startswith(str(loader.WHEEL_DIR)):
            continue
        try:
            for dist in Path(entry).glob("yt_dlp-*.dist-info"):
                return dist.name[len("yt_dlp-"):-len(".dist-info")]
        except OSError:
            continue
    return "unknown"


def wheel_key(version):
    return f"wheels/yt_dlp-{version}-py3-none-any.whl"


class CaptureLogger:
    """yt-dlp logger that keeps warnings and errors for the response and canary."""

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
        if len(self.warnings) < 20:
            self.warnings.append(str(msg)[:400])


# ---------------------------------------------------------------- yt-dlp

async def activate(env, pointer):
    """Import the yt-dlp version named by pointer. Falls back to bundled on any failure."""
    if not pointer or pointer.get("source") == "bundled":
        return {"version": loader.use_bundled(), "source": "bundled"}
    version, sha = pointer["version"], pointer["sha256"]
    try:
        if loader.wheel_cached(version, sha):
            loader.use_wheel(version, sha)
        else:
            obj = await env.WHEELS.get(pointer.get("key") or wheel_key(version))
            if obj is None:
                raise LookupError(f"R2 object {wheel_key(version)} missing")
            data = to_bytes(await obj.arrayBuffer())
            loader.use_wheel(version, sha, data)
        return {"version": version, "source": "wheel", "sha256": sha}
    except Exception as err:  # noqa: BLE001
        return {"version": loader.use_bundled(), "source": "bundled",
                "fallback_reason": f"{type(err).__name__}: {err}"[:300]}


def ytdl_options(logger, extra):
    opts = {
        "cachedir": False,
        "js_runtimes": {},
        "quiet": True,
        "no_warnings": False,
        "logger": logger,
        "socket_timeout": 15,
        "retries": 0,
        "extractor_retries": 1,
        "ignore_no_formats_error": True,
        "noprogress": True,
        "extractor_args": {"youtube": {
            "player_skip": ["js"],
            "skip": ["hls", "dash", "translated_subs"],
        }},
    }
    opts.update(extra)
    return opts


def extract(url, extra_opts, max_requests, player_client=None):
    """Run yt-dlp synchronously. Network I/O suspends through JSPI inside the adapter."""
    import transport
    handler = transport.make_handler(transport.js_fetch, max_requests=max_requests)
    ydl_class = transport.make_youtube_dl_class(handler)
    logger = CaptureLogger()
    opts = ytdl_options(logger, extra_opts)
    if player_client:
        opts["extractor_args"]["youtube"]["player_client"] = player_client.split(",")
    ydl = ydl_class(opts)
    try:
        info = ydl.extract_info(url, download=False, process=False)
        if info and info.get("_type") == "playlist":
            entries = info.get("entries")
            limit = extra_opts.get("playlistend") or 50
            items = []
            for entry in entries or []:
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
    info, warnings, calls = extract(
        f"https://www.youtube.com/playlist?list={playlist_id}",
        {"extract_flat": True, "playlistend": limit},
        max_requests=4 + limit // 50 * 2,
        player_client=player_client,
    )
    return normalize_playlist(info, limit), warnings, calls


def get_video(video_id, player_client=None):
    info, warnings, calls = extract(
        f"https://www.youtube.com/watch?v={video_id}",
        {"noplaylist": True},
        max_requests=12,
        player_client=player_client,
    )
    return normalize_video(info), warnings, calls


# ---------------------------------------------------------------- daily job

async def js_fetch_bytes(url):
    import js
    reply = await js.fetch(url)
    if int(reply.status) != 200:
        raise RuntimeError(f"GET {url} returned {reply.status}")
    return to_bytes(await reply.arrayBuffer())


async def js_fetch_json(url):
    import js
    reply = await js.fetch(url)
    if int(reply.status) != 200:
        raise RuntimeError(f"GET {url} returned {reply.status}")
    return json.loads(str(await reply.text()))


async def ensure_wheel(env, release):
    """Store the release wheel in R2 (digest-checked) and record its pointer in KV."""
    import hashlib
    key = wheel_key(release["version"])
    meta_key = f"wheel:{release['version']}"
    meta = await kv_json(env, meta_key)
    if meta and meta.get("sha256") == release["sha256"]:
        return meta, False
    data = await js_fetch_bytes(release["url"])
    digest = hashlib.sha256(data).hexdigest()
    if digest != release["sha256"]:
        raise ValueError(f"PyPI wheel digest mismatch for {release['version']}: {digest}")
    await env.WHEELS.put(key, data, {
        "httpMetadata": {"contentType": "application/zip"},
        "customMetadata": {"sha256": digest, "version": release["version"]},
    })
    meta = {"version": release["version"], "source": "wheel", "sha256": digest, "key": key,
            "size": len(data), "url": release["url"], "uploaded": release.get("uploaded"),
            "stored_at": now_iso()}
    await kv_put_json(env, meta_key, meta)
    return meta, True


async def call_canary(env, pointer):
    """Run the suite in a separate invocation (own CPU and subrequest budget)."""
    target = "bundled" if pointer.get("source") == "bundled" else pointer["version"]
    started = time.time()
    try:
        reply = await env.SELF.fetch(
            f"https://self.internal/internal/canary?ytdlp={target}",
            headers={"x-canary-key": str(env.CANARY_KEY)},
        )
        text = await reply.text()
        result = json.loads(text)
        if reply.status != 200 and "cases" not in result:
            raise RuntimeError(f"canary returned {reply.status}: {text[:300]}")
    except Exception as err:  # noqa: BLE001
        result = {"ok": False, "failure_classes": [canary.NETWORK], "cases": [],
                  "error": f"{type(err).__name__}: {err}"[:500]}
    result["wall_ms"] = round((time.time() - started) * 1000)
    result["pointer"] = pointer
    return result


async def run_daily(env, channel="stable", promote=True):
    started = now_iso()
    record = {"started": started, "channel": channel, "promote_enabled": promote}
    try:
        pypi = await js_fetch_json("https://pypi.org/pypi/yt-dlp/json")
        release = canary.pick_release(pypi, channel)
        if release is None:
            raise LookupError(f"no {channel} py3-none-any wheel on PyPI")
        record["latest"] = {k: release[k] for k in ("version", "sha256", "uploaded")}
        candidate, stored = await ensure_wheel(env, release)
        record["candidate_stored_now"] = stored

        active = await kv_json(env, POINTER_ACTIVE) or bundled_pointer()
        last_good = await kv_json(env, POINTER_LAST_GOOD)
        record["active_before"] = active
        record["last_good_before"] = last_good

        active_result = await call_canary(env, active)
        candidate_result = None
        if not canary.same(candidate, active):
            candidate_result = await call_canary(env, candidate)
        last_good_result = None
        if not active_result.get("ok") and last_good and not canary.same(last_good, active) \
                and not canary.same(last_good, candidate):
            last_good_result = await call_canary(env, last_good)

        action, reason = canary.decide(active, active_result, candidate, candidate_result,
                                       last_good, last_good_result)
        record.update(action=action, reason=reason, results={
            "active": active_result, "candidate": candidate_result, "last_good": last_good_result})
        if promote and action == "promote":
            await kv_put_json(env, POINTER_LAST_GOOD, active)
            await kv_put_json(env, POINTER_ACTIVE, {**candidate, "promoted_at": now_iso()})
            record["active_after"] = candidate
        elif promote and action == "rollback":
            await kv_put_json(env, POINTER_ACTIVE, {**last_good, "promoted_at": now_iso(),
                                                    "rolled_back_from": active.get("version")})
            record["active_after"] = last_good
        else:
            record["active_after"] = active
    except Exception as err:  # noqa: BLE001
        record.update(action="error", reason=f"{type(err).__name__}: {err}"[:500])
    record["finished"] = now_iso()
    await save_run(env, record)
    return record


def summarize(record):
    results = record.get("results") or {}
    return {
        "started": record.get("started"),
        "finished": record.get("finished"),
        "channel": record.get("channel"),
        "latest": (record.get("latest") or {}).get("version"),
        "action": record.get("action"),
        "reason": record.get("reason"),
        "active_after": record.get("active_after"),
        "canaries": {name: None if not r else {
            "ok": r.get("ok"), "passed": r.get("passed"), "total": r.get("total"),
            "failure_classes": r.get("failure_classes"), "wall_ms": r.get("wall_ms"),
            "version": (r.get("pointer") or {}).get("version"),
            "source": (r.get("pointer") or {}).get("source"),
        } for name, r in results.items()},
    }


async def save_run(env, record):
    key = f"runs/{record['started']}.json"
    await env.WHEELS.put(key, json.dumps(record), {"httpMetadata": {"contentType": "application/json"}})
    summary = summarize(record)
    summary["record"] = key
    await kv_put_json(env, RUN_LATEST, summary)
    index = await kv_json(env, RUN_INDEX) or []
    index = [summary, *index][:RUN_HISTORY]
    await kv_put_json(env, RUN_INDEX, index)


# ---------------------------------------------------------------- entrypoint

class Default(WorkerEntrypoint):

    def authorized(self, request):
        expected = getattr(self.env, "CANARY_KEY", None)
        given = request.headers.get("x-canary-key")
        return bool(expected) and bool(given) and hmac.compare_digest(str(given), str(expected))

    async def fetch(self, request):
        parts = urlsplit(request.url)
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        method = request.method.upper()
        if method == "OPTIONS":
            return Response("", status=204, headers=CORS)
        try:
            if parts.path == "/health" and method == "GET":
                return await self.health()
            if parts.path in ("/video", "/playlist") and method == "GET":
                return await self.read(parts.path[1:], query, request)
            if parts.path == "/internal/canary" and method == "GET":
                if not self.authorized(request):
                    return json_response({"error": "unauthorized"}, 401)
                return await self.canary(query)
            if parts.path == "/admin/run-daily" and method == "POST":
                if not self.authorized(request):
                    return json_response({"error": "unauthorized"}, 401)
                channel = query.get("channel", "stable")
                if channel not in ("stable", "nightly"):
                    raise BadInput("channel must be stable or nightly")
                record = await run_daily(self.env, channel, promote=query.get("promote", "1") == "1")
                return json_response(record)
            if parts.path == "/" and method == "GET":
                return json_response({
                    "service": "doesitarm-youtube-api",
                    "routes": ["/health", "/playlist?id=PL...&limit=50", "/video?id=VIDEOID"],
                })
            return json_response({"error": "not found"}, 404)
        except BadInput as err:
            return json_response({"error": str(err)}, 400)

    async def scheduled(self, controller, *args):
        await run_daily(self.env, "stable", promote=True)

    async def health(self):
        active = await kv_json(self.env, POINTER_ACTIVE)
        return json_response({
            "ok": True,
            "api_version": API_VERSION,
            "bundled_ytdlp": bundled_version(),
            "active": active or bundled_pointer(),
            "last_good": await kv_json(self.env, POINTER_LAST_GOOD),
            "loaded_in_this_isolate": loader.loaded(),
            "last_run": await kv_json(self.env, RUN_LATEST),
            "recent_runs": [
                {k: r.get(k) for k in ("started", "action", "latest", "reason")}
                for r in (await kv_json(self.env, RUN_INDEX) or [])[:7]
            ],
        }, extra={"cache-control": "no-store"})

    async def pointer_for(self, requested):
        if requested is None:
            return await kv_json(self.env, POINTER_ACTIVE) or bundled_pointer()
        if requested == "bundled":
            return bundled_pointer()
        if not valid_version(requested):
            raise BadInput("ytdlp must be a version like 2026.11.23 or 'bundled'")
        meta = await kv_json(self.env, f"wheel:{requested}")
        if meta is None:
            raise BadInput(f"no stored wheel for yt-dlp {requested}")
        return meta

    async def read(self, kind, query, request):
        privileged = self.authorized(request)
        requested = query.get("ytdlp")
        player_client = query.get("player_client")
        if (requested or player_client or query.get("debug")) and not privileged:
            return json_response({"error": "ytdlp, player_client and debug need the canary key"}, 401)
        if kind == "video":
            target = require_video_id(query.get("id"))
            limit = None
            cache_key = f"cache:v{API_VERSION}:video:{target}"
            ttl = VIDEO_TTL
        else:
            target = require_playlist_id(query.get("id"))
            limit = parse_limit(query.get("limit"))
            cache_key = f"cache:v{API_VERSION}:playlist:{target}:{limit}"
            ttl = PLAYLIST_TTL

        use_cache = not (requested or player_client or query.get("fresh"))
        cached = await kv_json(self.env, cache_key) if use_cache else None
        if cached and time.time() - cached.get("fetched_epoch", 0) < ttl:
            return json_response({**cached["data"], "meta": {**cached["meta"], "cache": "hit"}},
                                 extra={"cache-control": "public, max-age=300"})

        started = time.time()
        pointer = await self.pointer_for(requested)
        ytdlp = await activate(self.env, pointer)
        try:
            if kind == "video":
                data, warnings, calls = get_video(target, player_client)
            else:
                data, warnings, calls = get_playlist(target, limit, player_client)
        except Exception as err:  # noqa: BLE001
            text = f"{type(err).__name__}: {err}"[:600]
            failure = canary.classify(text, getattr(err, "warnings", []))
            body = {"error": "extraction failed", "class": failure, "detail": text, "ytdlp": ytdlp}
            if privileged:
                body["calls"] = getattr(err, "calls", [])
                body["warnings"] = getattr(err, "warnings", [])
            if cached and use_cache:
                return json_response({**cached["data"], "meta": {
                    **cached["meta"], "cache": "stale", "stale_reason": body}})
            return json_response(body, 502)

        meta = {"fetched_at": now_iso(), "ytdlp": ytdlp, "requests": len(calls),
                "elapsed_ms": round((time.time() - started) * 1000), "warnings": len(warnings)}
        if use_cache:
            await kv_put_json(self.env, cache_key, {"data": data, "meta": meta,
                                                    "fetched_epoch": time.time()}, ttl=STALE_KEEP)
        out = {**data, "meta": {**meta, "cache": "miss" if use_cache else "bypass"}}
        if privileged and query.get("debug"):
            out["meta"]["calls"] = calls
            out["meta"]["warning_text"] = warnings
        return json_response(out, extra={"cache-control": "public, max-age=300"})

    async def canary(self, query):
        pointer = await self.pointer_for(query.get("ytdlp") or "bundled")
        ytdlp = await activate(self.env, pointer)
        started = time.time()

        def playlist(pid, limit):
            data, warnings, _ = get_playlist(pid, limit)
            return data, warnings

        def video(vid):
            data, warnings, _ = get_video(vid)
            return data, warnings

        result = canary.run_suite(playlist, video, time.time)
        if ytdlp.get("fallback_reason") and pointer.get("source") != "bundled":
            # The requested wheel did not load; do not let a bundled pass count for it.
            result["ok"] = False
            result["failure_classes"] = sorted({*result["failure_classes"], canary.UPSTREAM_BROKE})
        result.update(ytdlp=ytdlp, requested=pointer, elapsed_ms=round((time.time() - started) * 1000),
                      at=now_iso())
        return json_response(result)

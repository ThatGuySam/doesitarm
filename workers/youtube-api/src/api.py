"""doesitarm-youtube-api: the public YouTube read API for Does It ARM.

Trusted code only. It never imports yt-dlp: extraction happens in
doesitarm-youtube-extract (service binding EXTRACT), whose JSON is validated by
schema.py before it is cached or returned. The active yt-dlp version and its wheel
bytes come from doesitarm-youtube-updater (service binding UPDATER). This Worker
holds no secrets and can write only its cache KV namespace.
"""

import json
import time
from urllib.parse import parse_qs, urlsplit

from workers import Response, WorkerEntrypoint

import canary
import schema
from normalize import BadInput, parse_limit, require_playlist_id, require_video_id
from wutil import CORS, call_extract, js_obj, json_response, kv_json, kv_put_json, now_iso, to_bytes

API_VERSION = 2
VIDEO_TTL = 6 * 3600
PLAYLIST_TTL = 3600
STALE_KEEP = 30 * 24 * 3600
NEGATIVE_TTL = 60
PLAYLIST_FETCH = 200  # playlists are fetched and cached at the maximum, then sliced
POINTER_TTL = 60
UPDATER = "https://updater.internal"
SNAPSHOT_PATH = "/snapshot/youtube-videos.json"

_pointer_cache = {"at": 0, "value": None}


def client_ip(request):
    return request.headers.get("cf-connecting-ip") or "unknown"


async def rate_ok(binding, key):
    if binding is None:
        return True
    outcome = await binding.limit(js_obj({"key": key}))
    return bool(outcome.success)


async def updater_json(env, path):
    reply = await env.UPDATER.fetch(UPDATER + path)
    if int(reply.status) != 200:
        raise RuntimeError(f"updater {path} returned {reply.status}")
    return json.loads(str(await reply.text()))


async def active_pointer(env):
    if _pointer_cache["value"] and time.time() - _pointer_cache["at"] < POINTER_TTL:
        return _pointer_cache["value"]
    try:
        pointer = await updater_json(env, "/internal/pointer")
    except Exception as err:  # noqa: BLE001 - fall back to the extractor's bundled copy
        print("pointer lookup failed", err)
        return {"source": "bundled", "version": None}
    _pointer_cache.update(at=time.time(), value=pointer)
    return pointer


class Default(WorkerEntrypoint):

    async def fetch(self, request):
        parts = urlsplit(request.url)
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        method = request.method.upper()
        if method == "OPTIONS":
            return Response("", status=204, headers=CORS)
        if method not in ("GET", "HEAD"):
            return json_response({"error": "method not allowed"}, 405)
        try:
            if parts.path == "/health":
                pointer = await active_pointer(self.env)
                return json_response({"ok": True, "ytdlp": {"version": pointer.get("version"),
                                                            "source": pointer.get("source")}},
                                     extra={"cache-control": "no-store"})
            if parts.path in ("/video", "/playlist"):
                return await self.read(parts.path[1:], query, request)
            if parts.path == SNAPSHOT_PATH:
                return await self.snapshot(request)
            if parts.path == "/":
                return json_response({
                    "service": "doesitarm-youtube-api",
                    "routes": ["/health", "/playlist?id=PL...&limit=50", "/video?id=VIDEOID", SNAPSHOT_PATH],
                })
            return json_response({"error": "not found"}, 404)
        except BadInput as err:
            return json_response({"error": str(err)}, 400)

    async def snapshot(self, request):
        reply = await self.env.UPDATER.fetch(UPDATER + "/internal/snapshot")
        if int(reply.status) != 200:
            return json_response({"error": "snapshot not available yet"}, 503)
        headers = {"content-type": "application/json; charset=utf-8", **CORS,
                   "cache-control": "public, max-age=900"}
        for name in ("etag", "last-modified", "x-snapshot-videos", "x-snapshot-generated"):
            value = reply.headers.get(name)
            if value:
                headers[name] = str(value)
        return Response(reply.body, headers=headers)

    async def read(self, kind, query, request):
        env = self.env
        if set(query) - {"id", "limit"}:
            raise BadInput("only id and limit are accepted")
        if kind == "video":
            target = require_video_id(query.get("id"))
            limit, ttl = None, VIDEO_TTL
        else:
            target = require_playlist_id(query.get("id"))
            limit, ttl = parse_limit(query.get("limit")), PLAYLIST_TTL
        cache_key = f"cache:v{API_VERSION}:{kind}:{target}"
        fail_key = f"fail:v{API_VERSION}:{kind}:{target}"

        def shape(data):
            if kind == "playlist":
                items = data.get("items", [])[:limit]
                return {**data, "items": items, "count": len(items)}
            return data

        def stale(cached, reason):
            return json_response({**shape(cached["data"]), "meta": {
                **cached["meta"], "cache": "stale", "stale_reason": reason}})

        cached = await kv_json(env.CACHE, cache_key)
        if cached and time.time() - cached.get("fetched_epoch", 0) < ttl:
            return json_response({**shape(cached["data"]), "meta": {**cached["meta"], "cache": "hit"}},
                                 extra={"cache-control": "public, max-age=300"})
        failure = await kv_json(env.CACHE, fail_key)
        if failure:
            if cached:
                return stale(cached, failure)
            return json_response({**failure, "cached_failure": True}, 502,
                                 extra={"cache-control": f"public, max-age={NEGATIVE_TTL}"})
        if not (await rate_ok(getattr(env, "MISS_PER_IP", None), client_ip(request))
                and await rate_ok(getattr(env, "MISS_GLOBAL", None), "all")):
            if cached:
                return stale(cached, "rate limited")
            return json_response({"error": "rate limited: too many uncached requests, retry in a minute"},
                                 429, extra={"retry-after": "60"})

        started = time.time()
        pointer = await active_pointer(env)
        job = {"op": kind, "id": target, "wheel": None,
               "player_client": str(env.PLAYER_CLIENT) if getattr(env, "PLAYER_CLIENT", None) else None}
        if kind == "playlist":
            job["limit"] = PLAYLIST_FETCH
        source = None
        if pointer.get("source") == "wheel":
            job["wheel"] = {"version": pointer["version"], "sha256": pointer["sha256"]}

            async def source():
                reply = await env.UPDATER.fetch(
                    f"{UPDATER}/internal/wheel?version={pointer['version']}&sha256={pointer['sha256']}")
                if int(reply.status) != 200:
                    raise RuntimeError(f"wheel fetch returned {reply.status}")
                return to_bytes(await reply.arrayBuffer())

        try:
            status, result = await call_extract(env.EXTRACT, job, source)
        except Exception as err:  # noqa: BLE001
            status, result = 502, {"ok": False, "error": f"{type(err).__name__}: {err}"[:300],
                                   "class": canary.NETWORK}
        ytdlp = result.get("ytdlp") if isinstance(result.get("ytdlp"), dict) else {}
        ytdlp = {"version": str(ytdlp.get("version"))[:40], "source": str(ytdlp.get("source"))[:10],
                 **({"fallback": True} if ytdlp.get("fallback_reason") else {})}
        data = None
        if status == 200 and result.get("ok"):
            try:
                if kind == "video":
                    data = schema.video(result.get("data"), target)
                else:
                    data = schema.playlist(result.get("data"), target, PLAYLIST_FETCH)
            except schema.InvalidOutput as err:
                result = {"ok": False, "error": f"invalid extractor output: {err}", "class": "invalid_output"}
        if data is None:
            klass = result.get("class") if result.get("class") in (
                canary.YOUTUBE_BLOCKED, canary.NETWORK, canary.UPSTREAM_BROKE, canary.UNAVAILABLE,
                "invalid_output") else canary.UPSTREAM_BROKE
            body = {"error": "extraction failed", "class": klass,
                    "detail": str(result.get("error") or f"extractor status {status}")[:600], "ytdlp": ytdlp}
            await kv_put_json(env.CACHE, fail_key, body, ttl=NEGATIVE_TTL)
            if cached:
                return stale(cached, body)
            return json_response(body, 502)

        meta = {"fetched_at": now_iso(), "ytdlp": ytdlp, "player_client": job["player_client"],
                "requests": result.get("requests") if isinstance(result.get("requests"), int) else None,
                "elapsed_ms": round((time.time() - started) * 1000)}
        await kv_put_json(env.CACHE, cache_key, {"data": data, "meta": meta, "fetched_epoch": time.time()},
                          ttl=STALE_KEEP)
        return json_response({**shape(data), "meta": {**meta, "cache": "miss"}},
                             extra={"cache-control": "public, max-age=300"})

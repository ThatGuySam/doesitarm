"""doesitarm-youtube-updater: the only Worker that changes state.

Cron only for promotion. Holds the admin key, the pointer KV namespace and the R2
bucket. Never imports yt-dlp: candidates are vetted here (attestation and static
checks) and exercised in doesitarm-youtube-extract, which gets the wheel bytes.

Routes
- `updater.internal` (reachable only through a service binding, since public
  requests always carry the workers.dev host): GET /internal/pointer,
  GET /internal/wheel?version=&sha256=, GET /internal/snapshot
- workers.dev, `x-admin-key` required: /admin/status, /admin/run-daily (dry run),
  /admin/check-release, /admin/stage-release, /admin/rollback, /admin/extract,
  /admin/snapshot-step
"""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlsplit

from workers import Response, WorkerEntrypoint

import bundled
import canary
import events
from normalize import BadInput, valid_version
from wutil import (
    call_extract,
    js_get,
    json_response,
    kv_json,
    kv_put_json,
    now_iso,
    r2_put_json,
    to_bytes,
)

INTERNAL_HOST = "updater.internal"
POINTER_ACTIVE = "pointer:active"
RUN_LATEST = "run:latest"
RUN_INDEX = "run:index"
RUN_HISTORY = 20
PYPI_JSON = "https://pypi.org/pypi/yt-dlp/json"
PROVENANCE_URL = "https://pypi.org/integrity/yt-dlp/{version}/{filename}/provenance"
DAILY_CRON = "17 9 * * *"


def bundled_pointer():
    return {"version": bundled.VERSION, "source": "bundled"}


def wheel_key(version):
    return f"wheels/yt_dlp-{version}-py3-none-any.whl"


def public_pointer(pointer):
    out = {"version": pointer.get("version"), "source": pointer.get("source")}
    if pointer.get("source") == "wheel":
        out["sha256"] = pointer.get("sha256")
    return out


async def active_pointer(env):
    return await kv_json(env.POINTERS, POINTER_ACTIVE) or bundled_pointer()


async def wheel_bytes(env, version, sha256):
    """Wheel bytes from R2, only for a stored attested wheel, digest re-checked."""
    meta = await kv_json(env.POINTERS, f"wheel:{version}")
    if not meta or meta.get("sha256") != sha256 or not meta.get("attestation"):
        raise LookupError(f"no attested wheel {version} {sha256[:12]}")
    obj = await env.WHEELS.get(wheel_key(version))
    if obj is None:
        raise LookupError(f"R2 object {wheel_key(version)} missing")
    data = to_bytes(await obj.arrayBuffer())
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError(f"R2 wheel {version} does not match its digest")
    return data


def extract_job(env, op, pointer, **args):
    job = {"op": op, "wheel": None, **args}
    if pointer and pointer.get("source") == "wheel":
        job["wheel"] = {"version": pointer["version"], "sha256": pointer["sha256"]}
    if "player_client" not in job:
        value = getattr(env, "PLAYER_CLIENT", None)
        job["player_client"] = str(value) if value else None
    return job


async def run_extract(env, op, pointer, **args):
    job = extract_job(env, op, pointer, **args)
    source = None
    if job["wheel"]:
        async def source():
            return await wheel_bytes(env, pointer["version"], pointer["sha256"])
    status, data = await call_extract(env.EXTRACT, job, source)
    await note_extract_result(env, "updater", op, data)
    return status, data


async def note_extract_result(env, caller, op, data):
    """Log sandbox egress that the gateway blocked (yt-dlp code bypassing the transport)."""
    blocked = data.get("egress_blocked") if isinstance(data, dict) else None
    if blocked:
        await events.record(env.WHEELS, "egress_blocked", {
            "caller": caller, "op": op, "hosts": [str(h)[:100] for h in blocked][:20],
            "ytdlp": data.get("ytdlp")})


# ---------------------------------------------------------------- release vetting

async def vet_release(release):
    """Attestation and static checks. Returns (bytes, attestation, checks). No import."""
    import provenance
    import release as rel
    rel.check_release_url(release)
    prov = json.loads(await js_get(PROVENANCE_URL.format(**release), 2 * 1024 * 1024,
                                   accept="application/vnd.pypi.integrity.v1+json"))
    attestation = provenance.verify_provenance(prov, release["filename"], release["sha256"])
    data = await js_get(release["url"], rel.MAX_WHEEL_BYTES)
    digest = hashlib.sha256(data).hexdigest()
    if digest != release["sha256"]:
        raise ValueError(f"PyPI wheel digest mismatch for {release['version']}: {digest}")
    checks = rel.check_wheel(data, release["version"], {"size": bundled.WHEEL_SIZE, "files": bundled.WHEEL_FILES})
    return data, attestation, checks


async def qualify_release(env, release):
    meta_key = f"wheel:{release['version']}"
    meta = await kv_json(env.POINTERS, meta_key)
    if meta and meta.get("sha256") == release["sha256"] and meta.get("attestation"):
        return meta, False
    data, attestation, checks = await vet_release(release)
    key = wheel_key(release["version"])
    from wutil import js_obj, js_bytes
    await env.WHEELS.put(key, js_bytes(data), js_obj({
        "httpMetadata": {"contentType": "application/zip"},
        "customMetadata": {"sha256": release["sha256"], "version": release["version"]},
    }))
    meta = {"version": release["version"], "source": "wheel", "sha256": release["sha256"], "key": key,
            "size": len(data), "url": release["url"], "uploaded": release.get("uploaded"),
            "stored_at": now_iso(), "attestation": attestation, "checks": checks}
    await kv_put_json(env.POINTERS, meta_key, meta)
    return meta, True


def release_from_pypi(pypi, version):
    files = [f for f in (pypi.get("releases") or {}).get(version, [])
             if f.get("filename") == f"yt_dlp-{version}-py3-none-any.whl"]
    if not files:
        raise BadInput(f"no py3-none-any wheel for {version}")
    f = files[0]
    return {"version": version, "url": f["url"], "sha256": f["digests"]["sha256"], "size": f.get("size"),
            "filename": f["filename"], "uploaded": f.get("upload_time_iso_8601")}


async def check_release(version):
    import release as rel
    if not valid_version(version or ""):
        raise BadInput("version must look like 2026.11.23")
    pypi = json.loads(await js_get(PYPI_JSON, 16 * 1024 * 1024))
    release = release_from_pypi(pypi, version)
    started = time.time()
    try:
        _data, attestation, checks = await vet_release(release)
        return {"ok": True, "release": release, "attestation": attestation, "checks": checks,
                "stable": rel.is_stable(version), "elapsed_ms": round((time.time() - started) * 1000)}
    except Exception as err:  # noqa: BLE001
        return {"ok": False, "release": release, "error": f"{type(err).__name__}: {err}"[:600]}


# ---------------------------------------------------------------- daily job

async def call_canary(env, pointer):
    started = time.time()
    try:
        status, result = await run_extract(env, "canary", pointer)
        if status != 200 or "cases" not in result:
            raise RuntimeError(f"canary returned {status}: {json.dumps(result)[:300]}")
    except Exception as err:  # noqa: BLE001
        result = {"ok": False, "failure_classes": [canary.NETWORK], "cases": [],
                  "error": f"{type(err).__name__}: {err}"[:500]}
    result["wall_ms"] = round((time.time() - started) * 1000)
    result["pointer"] = public_pointer(pointer)
    return result


async def run_daily(env, promote=True):
    """Qualify the newest eligible stable release; promote only from the cron."""
    import release as rel
    record = {"started": now_iso(), "promote_enabled": promote}
    try:
        active = await active_pointer(env)
        record["active_before"] = public_pointer(active)
        floor = max(active["version"], bundled.VERSION, key=rel.version_key)
        pypi = json.loads(await js_get(PYPI_JSON, 16 * 1024 * 1024))
        release, why = rel.pick_release(pypi, floor)
        record["release_choice"] = why
        candidate = None
        if release is not None:
            record["latest"] = {k: release[k] for k in ("version", "sha256", "uploaded")}
            try:
                candidate, record["candidate_stored_now"] = await qualify_release(env, release)
            except Exception as err:  # noqa: BLE001 - a rejected wheel is a hold, not a crash
                record["candidate_rejected"] = f"{type(err).__name__}: {err}"[:600]
                await events.record(env.WHEELS, "candidate_rejected", {
                    "version": release["version"], "reason": record["candidate_rejected"]})

        active_result = await call_canary(env, active)
        candidate_result = await call_canary(env, candidate) if candidate else None
        bundled_result = None
        if not active_result.get("ok") and active.get("source") != "bundled":
            bundled_result = await call_canary(env, bundled_pointer())
        for name, result in (("active", active_result), ("candidate", candidate_result),
                             ("bundled", bundled_result)):
            if result and not result.get("ok"):
                await events.record(env.WHEELS, "canary_failed", {
                    "which": name, "pointer": result.get("pointer"),
                    "failure_classes": result.get("failure_classes"), "passed": result.get("passed")})

        action, reason = canary.decide(active, active_result, candidate, candidate_result, bundled_result)
        if record.get("candidate_rejected") and action == "hold":
            reason = f"candidate rejected before import ({record['candidate_rejected'][:200]}); {reason}"
        record.update(action=action, reason=reason, results={
            "active": active_result, "candidate": candidate_result, "bundled": bundled_result})
        record["applied"] = bool(promote and action in ("promote", "rollback"))
        if promote and action == "promote":
            await kv_put_json(env.POINTERS, POINTER_ACTIVE, {**candidate, "promoted_at": now_iso()})
            record["active_after"] = public_pointer(candidate)
        elif promote and action == "rollback":
            await env.POINTERS.delete(POINTER_ACTIVE)
            record["active_after"] = bundled_pointer()
        else:
            record["active_after"] = public_pointer(active)
        if record["applied"]:
            await events.record(env.WHEELS, "pointer_changed", {
                "action": action, "from": record["active_before"], "to": record["active_after"],
                "reason": reason})
    except Exception as err:  # noqa: BLE001
        record.update(action="error", reason=f"{type(err).__name__}: {err}"[:500])
        await events.record(env.WHEELS, "daily_error", {"reason": record["reason"]})
    record["finished"] = now_iso()
    await save_run(env, record)
    return record


def summarize(record):
    results = record.get("results") or {}
    return {
        "started": record.get("started"),
        "finished": record.get("finished"),
        "latest": (record.get("latest") or {}).get("version"),
        "release_choice": record.get("release_choice"),
        "candidate_rejected": record.get("candidate_rejected"),
        "action": record.get("action"),
        "applied": record.get("applied"),
        "promote_enabled": record.get("promote_enabled"),
        "reason": record.get("reason"),
        "active_after": record.get("active_after"),
        "canaries": {name: None if not r else {
            "ok": r.get("ok"), "passed": r.get("passed"), "total": r.get("total"),
            "failure_classes": r.get("failure_classes"), "wall_ms": r.get("wall_ms"),
            "pointer": r.get("pointer"),
        } for name, r in results.items()},
    }


async def save_run(env, record):
    key = f"runs/{record['started']}.json"
    await r2_put_json(env.WHEELS, key, record)
    summary = summarize(record)
    summary["record"] = key
    await kv_put_json(env.POINTERS, RUN_LATEST, summary)
    index = await kv_json(env.POINTERS, RUN_INDEX) or []
    await kv_put_json(env.POINTERS, RUN_INDEX, [summary, *index][:RUN_HISTORY])


# ---------------------------------------------------------------- entrypoint

class Default(WorkerEntrypoint):

    def authorized(self, request):
        expected = getattr(self.env, "UPDATER_KEY", None)
        given = request.headers.get("x-admin-key")
        return bool(expected) and bool(given) and hmac.compare_digest(str(given), str(expected))

    async def fetch(self, request):
        parts = urlsplit(request.url)
        query = {k: v[0] for k, v in parse_qs(parts.query).items()}
        method = request.method.upper()
        try:
            if parts.hostname == INTERNAL_HOST and parts.path.startswith("/internal/"):
                if parts.path == "/internal/event" and method == "POST":
                    return await self.internal_event(request)
                return await self.internal(parts.path, query)
            if parts.path.startswith("/admin/"):
                if not self.authorized(request):
                    return json_response({"error": "unauthorized"}, 401, cors=False)
                return await self.admin(parts.path, method, query)
            return json_response({"service": "doesitarm-youtube-updater"}, 404, cors=False)
        except BadInput as err:
            return json_response({"error": str(err)}, 400, cors=False)

    async def scheduled(self, controller, *args):
        await run_daily(self.env, promote=True)

    async def internal_event(self, request):
        """Events reported by the API (it has no storage of its own)."""
        try:
            event = json.loads(str(await request.text())[:8000])
        except ValueError:
            raise BadInput("event must be JSON") from None
        if not isinstance(event, dict) or event.get("kind") not in ("egress_blocked", "extractor_invalid"):
            raise BadInput("unknown event kind")
        await events.record(self.env.WHEELS, event["kind"], {"caller": "api", "detail": event.get("detail")})
        return json_response({"ok": True}, cors=False)

    async def internal(self, path, query):
        if path == "/internal/pointer":
            return json_response(public_pointer(await active_pointer(self.env)), cors=False)
        if path == "/internal/wheel":
            data = await wheel_bytes(self.env, query.get("version", ""), query.get("sha256", ""))
            return Response(data, headers={"content-type": "application/zip"})
        return json_response({"error": "not found"}, 404, cors=False)

    async def admin(self, path, method, query):
        env = self.env
        if path == "/admin/status" and method == "GET":
            return json_response({
                "bundled": {"version": bundled.VERSION, "sha256": bundled.WHEEL_SHA256},
                "active": await active_pointer(env),
                "last_run": await kv_json(env.POINTERS, RUN_LATEST),
                "recent_runs": [{k: r.get(k) for k in ("started", "action", "applied", "latest", "reason")}
                                for r in (await kv_json(env.POINTERS, RUN_INDEX) or [])[:7]],
                "events": await events.summary(env.WHEELS),
            }, cors=False)
        if path == "/admin/run-daily" and method == "POST":
            return json_response(await run_daily(env, promote=False), cors=False)
        if path == "/admin/check-release" and method == "POST":
            return json_response(await check_release(query.get("version")), cors=False)
        if path == "/admin/stage-release" and method == "POST":
            # Vet and store an attested wheel so it can be canaried or debugged with
            # /admin/extract. Staging never changes the active pointer.
            if not valid_version(query.get("version") or ""):
                raise BadInput("version must look like 2026.11.23")
            pypi = json.loads(await js_get(PYPI_JSON, 16 * 1024 * 1024))
            meta, stored = await qualify_release(env, release_from_pypi(pypi, query["version"]))
            result = {"staged": public_pointer(meta), "stored_now": stored}
            if query.get("canary") == "1":
                result["canary"] = await call_canary(env, meta)
            return json_response(result, cors=False)
        if path == "/admin/rollback" and method == "POST":
            before = await active_pointer(env)
            await env.POINTERS.delete(POINTER_ACTIVE)
            await events.record(env.WHEELS, "pointer_changed", {
                "action": "manual_rollback", "from": public_pointer(before), "to": bundled_pointer()})
            return json_response({"active": bundled_pointer(), "was": public_pointer(before)}, cors=False)
        if path == "/admin/extract" and method == "POST":
            # Debug a single extraction with any stored attested wheel. Output is untrusted
            # and only returned to the admin; nothing is cached or promoted.
            requested = query.get("ytdlp")
            if requested in (None, "", "active"):
                pointer = await active_pointer(env)
            elif requested == "bundled":
                pointer = bundled_pointer()
            else:
                pointer = await kv_json(env.POINTERS, f"wheel:{requested}")
                if not pointer or not pointer.get("attestation"):
                    raise BadInput(f"no attested wheel stored for {requested}")
            args = {"id": query.get("id")}
            op = query.get("op", "video")
            if op == "playlist":
                args["limit"] = int(query.get("limit", "50"))
            if query.get("player_client"):
                args["player_client"] = query["player_client"]
            status, data = await run_extract(env, op, pointer, **args)
            return json_response({"status": status, "result": data}, cors=False)
        return json_response({"error": "not found"}, 404, cors=False)

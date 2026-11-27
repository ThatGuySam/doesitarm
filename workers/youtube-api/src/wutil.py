"""Small Worker helpers shared by the trusted Workers (API and updater)."""

import json
import time

from workers import Response

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
}
EXTRACT_URL = "https://extract.internal/"


def json_response(data, status=200, extra=None, cors=True):
    headers = {"content-type": "application/json; charset=utf-8", **(CORS if cors else {})}
    if extra:
        headers.update(extra)
    return Response(json.dumps(data, ensure_ascii=False), status=status, headers=headers)


def now_iso(epoch=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


def to_bytes(value):
    if value is None:
        return None
    if hasattr(value, "to_bytes"):
        return value.to_bytes()
    if hasattr(value, "to_py"):
        value = value.to_py()
    return bytes(value)


def js_bytes(data):
    import js
    array = js.Uint8Array.new(len(data))
    array.assign(data)
    return array


def js_obj(value):
    import js
    from pyodide.ffi import to_js
    return to_js(value, dict_converter=js.Object.fromEntries)


def missing(value):
    """True for None and JavaScript null/undefined (raw bindings return JsNull)."""
    return value is None or type(value).__name__ in ("JsNull", "JsUndefined")


def raw(binding):
    """The JavaScript binding behind the SDK wrapper. The wrapper walks every argument
    element by element (a 10 MB body costs minutes of CPU), so large R2 writes use
    the raw binding."""
    return getattr(binding, "_binding", binding)


async def r2_put(bucket, key, body, content_type="application/json; charset=utf-8", custom=None):
    """R2 put through the raw binding. body: str, bytes or a JS stream."""
    if isinstance(body, (bytes, bytearray)):
        body = js_bytes(body)
    options = {"httpMetadata": {"contentType": content_type}}
    if custom:
        options["customMetadata"] = custom
    await raw(bucket).put(key, body, js_obj(options))


async def kv_json(namespace, key):
    value = await namespace.get(key)
    if not isinstance(value, str) or not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        return None


async def kv_put_json(namespace, key, value, ttl=None):
    if ttl:
        await namespace.put(key, json.dumps(value), js_obj({"expirationTtl": ttl}))
    else:
        await namespace.put(key, json.dumps(value))


async def r2_json(bucket, key):
    obj = await raw(bucket).get(key)
    if missing(obj):
        return None
    return json.loads(str(await obj.text()))


async def r2_put_json(bucket, key, value):
    await r2_put(bucket, key, json.dumps(value, ensure_ascii=False))


async def js_get(url, max_bytes, accept=None):
    """GET with a byte cap (trusted code only)."""
    import js
    init = {"headers": {"accept": accept}} if accept else {}
    reply = await js.fetch(url, js_obj(init))
    if int(reply.status) != 200:
        raise RuntimeError(f"GET {url} returned {reply.status}")
    length = reply.headers.get("content-length")
    if length and int(length) > max_bytes:
        raise RuntimeError(f"GET {url}: {length} bytes is over the {max_bytes} cap")
    data = to_bytes(await reply.arrayBuffer())
    if len(data) > max_bytes:
        raise RuntimeError(f"GET {url}: {len(data)} bytes is over the {max_bytes} cap")
    return data


async def call_extract(binding, job, wheel_source=None, max_reply=24 * 1024 * 1024):
    """POST a job to the extractor. wheel_source is an async function returning wheel
    bytes, called only if the extractor asks for them. Returns (status, data)."""
    head = json.dumps(job).encode("utf-8") + b"\n"
    service = raw(binding)
    reply = await service.fetch(EXTRACT_URL, js_obj({"method": "POST", "body": js_bytes(head)}))
    if int(reply.status) == 409 and wheel_source is not None:
        wheel = await wheel_source()
        reply = await service.fetch(EXTRACT_URL, js_obj({"method": "POST", "body": js_bytes(head + wheel)}))
    text = str(await reply.text())
    if len(text) > max_reply:
        return 502, {"error": "extractor reply too large"}
    try:
        data = json.loads(text)
    except ValueError:
        return 502, {"error": f"extractor reply is not JSON: {text[:200]}"}
    if not isinstance(data, dict):
        return 502, {"error": "extractor reply is not an object"}
    return int(reply.status), data

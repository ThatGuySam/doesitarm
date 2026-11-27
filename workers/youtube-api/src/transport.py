"""A yt-dlp RequestHandler that sends requests through the Workers `fetch` API.

yt-dlp's own transports use blocking sockets, which Python Workers do not have.
This handler converts each yt-dlp Request into a JavaScript `fetch` call and
waits for it with `pyodide.ffi.run_sync` (JSPI), so unmodified yt-dlp keeps its
synchronous call chain.

The yt-dlp-facing logic (allowlist, cookies, redirects, decoding, errors) only
depends on an injected `fetch_fn`, so CPython unit tests can drive it with a fake.
"""

import email.message
import gzip
import io
import time
import urllib.request
import zlib
from urllib.parse import urljoin, urlsplit

ALLOWED_HOSTS = frozenset({
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "consent.youtube.com",
})
MAX_REDIRECTS = 5
DEFAULT_MAX_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_REQUESTS = 40
REDIRECT_CODES = (301, 302, 303, 307, 308)
# Headers that must not follow a redirect to a different origin.
ORIGIN_BOUND_HEADERS = ("authorization", "cookie", "proxy-authorization")


class FetchTimeout(Exception):
    pass


class FetchFailed(Exception):
    pass


class BodyTooLarge(Exception):
    pass


class RawReply:
    """What a fetch_fn returns: status, header pairs, Set-Cookie values, decoded body."""

    def __init__(self, status, headers, set_cookies, body, wire_encoding=None):
        self.status = status
        self.headers = headers
        self.set_cookies = set_cookies
        self.body = body
        self.wire_encoding = wire_encoding


def host_allowed(url):
    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "") in ALLOWED_HOSTS and parts.port in (None, 443)


def decode_body(body, content_encoding):
    """Workers fetch already decodes gzip/br bodies. Decode only if bytes are still encoded."""
    encoding = (content_encoding or "").strip().lower()
    if encoding == "gzip" and body[:2] == b"\x1f\x8b":
        return gzip.decompress(body), "gzip-decoded-in-python"
    if encoding == "deflate" and body[:1] == b"\x78":
        try:
            return zlib.decompress(body), "deflate-decoded-in-python"
        except zlib.error:
            pass
    return body, None


class _CookieResponse:
    """Minimal response object for http.cookiejar.extract_cookies."""

    def __init__(self, set_cookies):
        self._message = email.message.Message()
        for value in set_cookies:
            self._message["Set-Cookie"] = value

    def info(self):
        return self._message


def make_handler(fetch_fn, *, max_bytes=DEFAULT_MAX_BYTES, max_requests=DEFAULT_MAX_REQUESTS):
    """Build the RequestHandler class. Call after yt-dlp is imported (it may be reloaded per version)."""
    from yt_dlp.networking.common import RequestHandler, Response
    from yt_dlp.networking.exceptions import (
        HTTPError,
        TransportError,
        UnsupportedRequest,
    )

    try:
        from yt_dlp.networking._helper import get_redirect_method
    except ImportError:  # pragma: no cover - fallback if upstream moves the helper
        def get_redirect_method(method, status):
            if status == 303 and method != "HEAD":
                return "GET"
            if status in (301, 302) and method == "POST":
                return "GET"
            return method

    class WorkerFetchRH(RequestHandler):
        RH_KEY = "WorkerFetch"
        RH_NAME = "workerfetch"
        _SUPPORTED_URL_SCHEMES = ("https",)
        _SUPPORTED_PROXY_SCHEMES = ()
        _SUPPORTED_FEATURES = ()

        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.calls = []

        def _check_extensions(self, extensions):
            super()._check_extensions(extensions)
            for key in ("cookiejar", "timeout", "legacy_ssl", "keep_header_casing"):
                extensions.pop(key, None)

        def _validate(self, request):
            if not host_allowed(request.url):
                raise UnsupportedRequest(f"host not allowed by the Worker adapter: {urlsplit(request.url).hostname}")
            super()._validate(request)

        def _request_headers(self, request, url, headers):
            out = {k: v for k, v in headers.items() if k.lower() not in ("cookie", "accept-encoding", "content-length")}
            jar_cookie = self._get_cookiejar(request).get_cookie_header(url)
            explicit = next((v for k, v in headers.items() if k.lower() == "cookie"), None)
            cookie = "; ".join(c for c in (explicit, jar_cookie) if c)
            if cookie:
                out["Cookie"] = cookie
            return out

        def _store_cookies(self, request, url, set_cookies):
            if set_cookies:
                self._get_cookiejar(request).extract_cookies(
                    _CookieResponse(set_cookies), urllib.request.Request(url))

        def _send(self, request):
            timeout = self._calculate_timeout(request)
            method = request.method
            url = request.url
            body = request.data
            headers = dict(self._merge_headers(request.headers))
            origin = urlsplit(url)[:2]

            for hop in range(MAX_REDIRECTS + 1):
                if len(self.calls) >= max_requests:
                    raise TransportError(cause=f"request budget of {max_requests} exhausted")
                started = time.monotonic()
                try:
                    reply = fetch_fn(method, url, self._request_headers(request, url, headers),
                                     body, timeout, max_bytes)
                except FetchTimeout as err:
                    self.calls.append({"method": method, "path": urlsplit(url).path, "error": "timeout"})
                    raise TransportError(cause=f"timed out after {timeout}s: {err}") from err
                except BodyTooLarge as err:
                    self.calls.append({"method": method, "path": urlsplit(url).path, "error": "too-large"})
                    raise TransportError(cause=f"response larger than {max_bytes} bytes") from err
                except FetchFailed as err:
                    self.calls.append({"method": method, "path": urlsplit(url).path, "error": str(err)[:200]})
                    raise TransportError(cause=str(err)) from err
                header_map = {}
                for name, value in reply.headers:
                    header_map.setdefault(name.lower(), value)
                body_bytes, decoded_by = decode_body(reply.body, header_map.get("content-encoding"))
                self.calls.append({
                    "method": method,
                    "path": urlsplit(url).path,
                    "status": reply.status,
                    "ms": round((time.monotonic() - started) * 1000),
                    "bytes": len(body_bytes),
                    "encoding": reply.wire_encoding or header_map.get("content-encoding"),
                    **({"decoded": decoded_by} if decoded_by else {}),
                })
                self._store_cookies(request, url, reply.set_cookies)

                location = header_map.get("location")
                if reply.status in REDIRECT_CODES and location:
                    next_url = urljoin(url, location)
                    if not host_allowed(next_url):
                        target = urlsplit(next_url)
                        if (target.hostname or "").endswith("google.com") and target.path.startswith("/sorry"):
                            raise TransportError(cause="YouTube redirected to Google's unusual traffic (/sorry) "
                                                       "CAPTCHA page; this egress IP is being challenged")
                        raise TransportError(cause=f"redirect to disallowed URL {target.hostname}")
                    new_method = get_redirect_method(method, reply.status)
                    if new_method != method or reply.status == 303:
                        body = None
                        headers = {k: v for k, v in headers.items()
                                   if k.lower() not in ("content-type", "content-length")}
                    if urlsplit(next_url)[:2] != origin:
                        headers = {k: v for k, v in headers.items() if k.lower() not in ORIGIN_BOUND_HEADERS}
                    method, url = new_method, next_url
                    continue

                # The body is already decoded, so drop wire-level framing headers.
                clean = {k: v for k, v in header_map.items()
                         if k not in ("content-encoding", "content-length", "transfer-encoding", "set-cookie")}
                response = Response(io.BytesIO(body_bytes), url, clean, reply.status)
                if not 200 <= reply.status < 300:
                    raise HTTPError(response, redirect_loop=False)
                return response

            raise TransportError(cause=f"more than {MAX_REDIRECTS} redirects")

    return WorkerFetchRH


def make_youtube_dl_class(handler_cls):
    from yt_dlp import YoutubeDL

    class WorkerYoutubeDL(YoutubeDL):
        """YoutubeDL whose only transport is the Worker fetch handler (no sockets)."""

        @property
        def _request_director(self):
            director = self.__dict__.get("_worker_director")
            if director is None:
                director = self.build_request_director([handler_cls])
                self.__dict__["_worker_director"] = director
            return director

        def fetch_calls(self):
            return self._request_director.handlers[handler_cls.RH_KEY].calls

    return WorkerYoutubeDL


def js_fetch(method, url, headers, body, timeout, max_bytes):
    """fetch_fn backed by the Workers runtime. Only importable inside workerd."""
    import js
    from pyodide.ffi import JsException, run_sync, to_js

    js_headers = js.Headers.new()
    for name, value in headers.items():
        js_headers.set(name, value)
    init = {
        "method": method,
        "headers": js_headers,
        "redirect": "manual",
        "signal": js.AbortSignal.timeout(int((timeout or 20) * 1000)),
    }
    if body is not None:
        data = js.Uint8Array.new(len(body))
        data.assign(body)
        init["body"] = data
    try:
        reply = run_sync(js.fetch(url, to_js(init, dict_converter=js.Object.fromEntries)))
        pairs = [(str(p[0]), str(p[1])) for p in reply.headers.entries()]
        try:
            set_cookies = [str(c) for c in reply.headers.getSetCookie()]
        except Exception:
            set_cookies = [v for k, v in pairs if k.lower() == "set-cookie"]
        chunks = []
        size = 0
        if reply.body is not None:
            reader = reply.body.getReader()
            while True:
                part = run_sync(reader.read())
                if part.done:
                    break
                chunk = part.value.to_bytes()
                size += len(chunk)
                if size > max_bytes:
                    run_sync(reader.cancel())
                    raise BodyTooLarge(size)
                chunks.append(chunk)
        encoding = next((v for k, v in pairs if k.lower() == "content-encoding"), None)
        return RawReply(int(reply.status), pairs, set_cookies, b"".join(chunks), encoding)
    except JsException as err:
        name = getattr(err, "name", "") or ""
        text = str(err)
        if "TimeoutError" in name or "AbortError" in name or "TimeoutError" in text or "aborted" in text:
            raise FetchTimeout(text) from None
        raise FetchFailed(text) from None

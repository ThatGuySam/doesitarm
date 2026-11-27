"""CPython unit tests. Run: python3 -I tests/test_units.py (after scripts/vendor.sh)."""

import gzip
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(1, str(ROOT / "python_modules"))

import canary  # noqa: E402
import transport  # noqa: E402
from normalize import (  # noqa: E402
    BadInput,
    normalize_playlist,
    normalize_video,
    parse_limit,
    parse_timestamps,
    require_playlist_id,
    require_video_id,
    valid_version,
)


class NormalizeTests(unittest.TestCase):
    def test_timestamps_match_old_reader(self):
        text = "Intro\n0:00 Start\r\n1:02:03 Long one\nno time here\n12:5 not a stamp\n- 05:30 Benchmarks"
        self.assertEqual(parse_timestamps(text), [
            {"time": "0:00", "fullText": "0:00 Start"},
            {"time": "1:02:03", "fullText": "1:02:03 Long one"},
            {"time": "05:30", "fullText": "- 05:30 Benchmarks"},
        ])
        self.assertEqual(parse_timestamps("   "), [])
        self.assertEqual(parse_timestamps(None), [])

    def test_ids(self):
        self.assertEqual(require_video_id("3SG5e4z-Ygg"), "3SG5e4z-Ygg")
        self.assertEqual(require_playlist_id("PLaa9cZC07ZPFqjoYLZRR3kbbnJRHhlmXq"),
                         "PLaa9cZC07ZPFqjoYLZRR3kbbnJRHhlmXq")
        for bad in ("", "3SG5e4z-Yg", "3SG5e4z-Ygg1", "../../etc", "abc def ghij", None,
                    "https://evil.example/x"):
            with self.assertRaises(BadInput):
                require_video_id(bad)
        for bad in ("XXaa9cZC07ZPFqjoYLZRR3kbbnJRHhlmXq", "PL", "PL" + "a" * 80, "PLabc/../x1234"):
            with self.assertRaises(BadInput):
                require_playlist_id(bad)

    def test_limit_and_version(self):
        self.assertEqual(parse_limit(None), 50)
        self.assertEqual(parse_limit("200"), 200)
        for bad in ("0", "201", "-1", "1e3", "x"):
            with self.assertRaises(BadInput):
                parse_limit(bad)
        self.assertTrue(valid_version("2026.11.23"))
        self.assertTrue(valid_version("2026.11.24.232653.dev0"))
        self.assertFalse(valid_version("../2026"))

    def test_shapes(self):
        video = normalize_video({"id": "3SG5e4z-Ygg", "title": "T", "description": "0:10 a",
                                 "tags": ["x"], "thumbnails": [{"url": "u1", "preference": -5},
                                                               {"url": "u2", "preference": 1}]})
        self.assertEqual(video["timestamps"], [{"time": "0:10", "fullText": "0:10 a"}])
        self.assertEqual(video["thumbnail"], "u2")
        playlist = normalize_playlist({"id": "PLx", "entries": [
            {"id": "3SG5e4z-Ygg", "title": "a"}, None, {"id": "bad"}, {"id": "yLVcRkFtEcA"}]}, 10)
        self.assertEqual([i["id"] for i in playlist["items"]], ["3SG5e4z-Ygg", "yLVcRkFtEcA"])
        self.assertEqual(playlist["items"][1]["index"], 4)


class FakeFetch:
    def __init__(self, replies):
        self.replies = list(replies)
        self.seen = []

    def __call__(self, method, url, headers, body, timeout, max_bytes):
        self.seen.append({"method": method, "url": url, "headers": dict(headers), "body": body})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def director_for(fake, **kwargs):
    from yt_dlp import YoutubeDL
    handler = transport.make_handler(fake, **kwargs)
    ydl_class = transport.make_youtube_dl_class(handler)
    ydl = ydl_class({"quiet": True, "cachedir": False})
    return ydl, YoutubeDL


class TransportTests(unittest.TestCase):
    def setUp(self):
        from yt_dlp.networking import Request
        from yt_dlp.networking.exceptions import HTTPError, RequestError, TransportError
        self.Request, self.HTTPError, self.RequestError, self.TransportError = (
            Request, HTTPError, RequestError, TransportError)

    def test_cookies_and_redirect_post_to_get(self):
        fake = FakeFetch([
            transport.RawReply(302, [("Location", "/watch?v=x")],
                               ["VISITOR=abc; Domain=.youtube.com; Path=/; Secure"], b""),
            transport.RawReply(200, [("Content-Type", "text/html")], ["YSC=def; Path=/; Secure"], b"ok"),
            transport.RawReply(200, [], [], b"again"),
        ])
        ydl, _ = director_for(fake)
        with ydl:
            response = ydl.urlopen(self.Request("https://www.youtube.com/start", data=b"{}",
                                                headers={"Content-Type": "application/json"}))
            self.assertEqual(response.read(), b"ok")
            self.assertEqual(response.url, "https://www.youtube.com/watch?v=x")
            ydl.urlopen(self.Request("https://www.youtube.com/next")).read()
        self.assertEqual(fake.seen[0]["method"], "POST")
        self.assertEqual(fake.seen[1]["method"], "GET")
        self.assertIsNone(fake.seen[1]["body"])
        self.assertNotIn("Content-Type", fake.seen[1]["headers"])
        self.assertIn("VISITOR=abc", fake.seen[1]["headers"].get("Cookie", ""))
        cookie = fake.seen[2]["headers"].get("Cookie", "")
        self.assertIn("VISITOR=abc", cookie)
        self.assertIn("YSC=def", cookie)
        for seen in fake.seen:
            self.assertNotIn("Accept-Encoding", seen["headers"])

    def test_307_keeps_method_and_body(self):
        fake = FakeFetch([
            transport.RawReply(307, [("location", "https://www.youtube.com/b")], [], b""),
            transport.RawReply(200, [], [], b"done"),
        ])
        ydl, _ = director_for(fake)
        with ydl:
            ydl.urlopen(self.Request("https://www.youtube.com/a", data=b"payload")).read()
        self.assertEqual(fake.seen[1]["method"], "POST")
        self.assertEqual(fake.seen[1]["body"], b"payload")

    def test_redirect_off_allowlist_is_refused(self):
        fake = FakeFetch([transport.RawReply(302, [("Location", "https://evil.example/")], [], b"")])
        ydl, _ = director_for(fake)
        with ydl, self.assertRaises(self.TransportError):
            ydl.urlopen(self.Request("https://www.youtube.com/a"))
        self.assertEqual(len(fake.seen), 1)

    def test_disallowed_host_never_fetched(self):
        fake = FakeFetch([])
        ydl, _ = director_for(fake)
        with ydl, self.assertRaises(self.RequestError):
            ydl.urlopen(self.Request("https://i.ytimg.com/vi/x/hq.jpg"))
        with ydl, self.assertRaises(self.RequestError):
            ydl.urlopen(self.Request("http://www.youtube.com/"))
        self.assertEqual(fake.seen, [])

    def test_gzip_still_encoded_is_decoded_once(self):
        fake = FakeFetch([
            transport.RawReply(200, [("Content-Encoding", "gzip")], [], gzip.compress(b"hello")),
            transport.RawReply(200, [("Content-Encoding", "br")], [], b"already-decoded"),
        ])
        ydl, _ = director_for(fake)
        with ydl:
            first = ydl.urlopen(self.Request("https://www.youtube.com/a"))
            self.assertEqual(first.read(), b"hello")
            self.assertIsNone(first.headers.get("Content-Encoding"))
            self.assertEqual(ydl.urlopen(self.Request("https://www.youtube.com/b")).read(),
                             b"already-decoded")

    def test_http_error_and_timeout(self):
        fake = FakeFetch([
            transport.RawReply(429, [], [], b"slow down"),
            transport.FetchTimeout("TimeoutError"),
            transport.BodyTooLarge(10),
        ])
        ydl, _ = director_for(fake)
        with ydl:
            with self.assertRaises(self.HTTPError) as ctx:
                ydl.urlopen(self.Request("https://www.youtube.com/a"))
            self.assertEqual(ctx.exception.status, 429)
            with self.assertRaises(self.TransportError):
                ydl.urlopen(self.Request("https://www.youtube.com/b"))
            with self.assertRaises(self.TransportError):
                ydl.urlopen(self.Request("https://www.youtube.com/c"))

    def test_request_budget(self):
        fake = FakeFetch([transport.RawReply(200, [], [], b"x")] * 5)
        ydl, _ = director_for(fake, max_requests=2)
        with ydl:
            ydl.urlopen(self.Request("https://www.youtube.com/1")).read()
            ydl.urlopen(self.Request("https://www.youtube.com/2")).read()
            with self.assertRaises(self.TransportError):
                ydl.urlopen(self.Request("https://www.youtube.com/3"))

    def test_redirect_loop_limit(self):
        fake = FakeFetch([transport.RawReply(302, [("Location", "/loop")], [], b"")] * 10)
        ydl, _ = director_for(fake)
        with ydl, self.assertRaises(self.TransportError):
            ydl.urlopen(self.Request("https://www.youtube.com/loop"))
        self.assertEqual(len(fake.seen), transport.MAX_REDIRECTS + 1)


class CanaryTests(unittest.TestCase):
    A = {"version": "2026.11.23", "source": "bundled"}
    C = {"version": "2026.11.23", "source": "wheel", "sha256": "x"}
    G = {"version": "2026.10.1", "source": "wheel", "sha256": "y"}

    def test_classify(self):
        self.assertEqual(canary.classify("ERROR: Sign in to confirm you're not a bot"), canary.YOUTUBE_BLOCKED)
        self.assertEqual(canary.classify("HTTP Error 429: Too Many Requests"), canary.YOUTUBE_BLOCKED)
        self.assertEqual(canary.classify("TransportError: timed out after 15s"), canary.NETWORK)
        self.assertEqual(canary.classify("KeyError: 'contents'"), canary.UPSTREAM_BROKE)

    def test_decide(self):
        green = {"ok": True, "failure_classes": []}
        broke = {"ok": False, "failure_classes": [canary.UPSTREAM_BROKE]}
        blocked = {"ok": False, "failure_classes": [canary.YOUTUBE_BLOCKED]}
        self.assertEqual(canary.decide(self.A, green, self.C, green)[0], "promote")
        self.assertEqual(canary.decide(self.A, green, self.C, broke)[0], "hold")
        self.assertEqual(canary.decide(self.A, green, self.A, green)[0], "hold")
        self.assertEqual(canary.decide(self.C, broke, self.C, None, self.G, green)[0], "rollback")
        self.assertEqual(canary.decide(self.C, blocked, None, None, self.G, green)[0], "hold")
        self.assertEqual(canary.decide(self.C, broke, None, None, self.G, broke)[0], "hold")

    def test_suite_marks_contract_failures(self):
        def playlist(pid, limit):
            case = next(c for c in canary.PLAYLIST_CASES if c["id"] == pid)
            return {"items": [{"id": i} for i in case["prefix"]]}, []

        def video(vid):
            if vid == "3SG5e4z-Ygg":
                raise RuntimeError("ERROR: [youtube] 3SG5e4z-Ygg: Sign in to confirm you're not a bot")
            case = next(c for c in canary.VIDEO_CASES if c["id"] == vid)
            return {"title": case["title"], "description": "x" * 10, "timestamps": [], "tags": []}, []

        result = canary.run_suite(playlist, video, lambda: 0)
        self.assertFalse(result["ok"])
        self.assertEqual(result["passed"], 3)
        self.assertEqual(result["failure_classes"], [canary.CONTRACT, canary.YOUTUBE_BLOCKED])

    def test_pick_release(self):
        pypi = {"info": {"version": "2026.11.23"}, "releases": {
            "2026.11.23": [{"packagetype": "bdist_wheel", "filename": "yt_dlp-2026.11.23-py3-none-any.whl",
                            "url": "u", "digests": {"sha256": "s"}}],
            "2026.11.24.232653.dev0": [{"packagetype": "bdist_wheel",
                                        "filename": "yt_dlp-2026.11.24.232653.dev0-py3-none-any.whl",
                                        "url": "n", "digests": {"sha256": "t"}}],
        }}
        self.assertEqual(canary.pick_release(pypi, "stable")["version"], "2026.11.23")
        self.assertEqual(canary.pick_release(pypi, "nightly")["version"], "2026.11.24.232653.dev0")


if __name__ == "__main__":
    unittest.main(verbosity=1)

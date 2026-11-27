"""CPython unit tests. Run: python3 -I tests/test_units.py (after scripts/vendor.sh)."""

import gzip
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(1, str(ROOT / "python_modules"))

import canary  # noqa: E402
import provenance  # noqa: E402
import release  # noqa: E402
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
        # Rollback goes to bundled only, and only when bundled passes.
        self.assertEqual(canary.decide(self.C, broke, None, None, green)[0], "rollback")
        self.assertEqual(canary.decide(self.C, broke, None, None, broke)[0], "hold")
        self.assertEqual(canary.decide(self.C, blocked, None, None, green)[0], "hold")
        self.assertEqual(canary.decide(self.A, broke, None, None, None)[0], "hold")
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



def _file(version, uploaded, sha="s", size=3186416):
    name = f"yt_dlp-{version}-py3-none-any.whl"
    return {"packagetype": "bdist_wheel", "filename": name, "size": size,
            "url": f"https://files.pythonhosted.org/packages/aa/bb/{name}", "digests": {"sha256": sha},
            "upload_time_iso_8601": uploaded}


class ReleaseTests(unittest.TestCase):
    NOW = release.parse_iso("2026-11-27T12:00:00")

    def pypi(self):
        return {"releases": {
            "2026.11.20": [_file("2026.11.20", "2026-11-20T10:00:00.1Z")],
            "2026.11.23": [_file("2026.11.23", "2026-11-23T23:50:00.0Z")],
            "2026.11.25": [_file("2026.11.25", "2026-11-25T08:00:00.0Z")],
            "2026.11.26.232653.dev0": [_file("2026.11.26.232653.dev0", "2026-11-20T00:00:00Z")],
        }}

    def test_stable_cooldown_and_strictly_newer(self):
        pick, _ = release.pick_release(self.pypi(), "2026.11.20", now=self.NOW)
        self.assertEqual(pick["version"], "2026.11.23")  # 2026.11.25 is too new, dev is ignored
        pick, why = release.pick_release(self.pypi(), "2026.11.23", now=self.NOW)
        self.assertIsNone(pick)
        self.assertIn("cooldown", why)
        pick, _ = release.pick_release(self.pypi(), "2026.11.25", now=self.NOW + 10 * 86400)
        self.assertIsNone(pick)  # never the same or older
        pick, _ = release.pick_release(self.pypi(), "2026.11.23", now=self.NOW + 3 * 86400)
        self.assertEqual(pick["version"], "2026.11.25")

    def test_url_check(self):
        good = {"version": "2026.11.23", **_file("2026.11.23", "x")}
        release.check_release_url(good)
        for bad in ({**good, "url": "https://evil.example/yt_dlp-2026.11.23-py3-none-any.whl"},
                    {**good, "url": "http://files.pythonhosted.org/p/yt_dlp-2026.11.23-py3-none-any.whl"},
                    {**good, "size": 50 * 1024 * 1024}):
            with self.assertRaises(release.WheelRejected):
                release.check_release_url(bad)

    def test_wheel_checks(self):
        import io
        import zipfile
        wheel = ROOT / ".vendor" / "yt_dlp-2026.11.23-py3-none-any.whl"
        data = wheel.read_bytes()
        ref = {"size": len(data), "files": 1056}
        self.assertEqual(release.check_wheel(data, "2026.11.23", ref)["files"], 1056)
        with self.assertRaises(release.WheelRejected):
            release.check_wheel(data, "2026.11.24", ref)  # version mismatch

        def rebuilt(extra_name):
            out = io.BytesIO()
            with zipfile.ZipFile(data and io.BytesIO(data)) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
                for info in src.infolist():
                    dst.writestr(info, src.read(info))
                dst.writestr(extra_name, b"import os")
            return out.getvalue()

        for name in ("evil.pth", "sitecustomize.py", "yt_dlp/_native.so", "../x.py",
                     "yt_dlp-2026.11.23.data/purelib/x.py"):
            with self.assertRaises(release.WheelRejected, msg=name):
                release.check_wheel(rebuilt(name), "2026.11.23", ref)
        with self.assertRaises(release.WheelRejected):
            release.check_wheel(data, "2026.11.23", {"size": len(data) * 2, "files": 1056})


class ProvenanceTests(unittest.TestCase):
    NAME = "yt_dlp-2026.11.23-py3-none-any.whl"
    SHA = "e9188e0c559905f7ee05acc1ba0b6fb3f310e7565bf6dea5f62b5300e0775e35"

    def load(self):
        import json
        return json.loads((ROOT / "tests" / "fixtures" / "provenance-yt_dlp-2026.11.23.json").read_text())

    def test_real_attestation_verifies(self):
        summary = provenance.verify_provenance(self.load(), self.NAME, self.SHA)
        self.assertTrue(summary["identity"].startswith(provenance.WORKFLOW_URI_PREFIX))

    def test_pinned_intermediate_chains_to_root(self):
        import base64
        inter = provenance.parse_certificate(base64.b64decode(provenance.FULCIO_INTERMEDIATE_B64))
        root = provenance.parse_certificate(base64.b64decode(provenance.FULCIO_ROOT_B64))
        self.assertTrue(provenance.verify_cert_signature(inter, root))

    def test_tampering_is_rejected(self):
        import base64
        import json

        def flip_b64(value, index):
            raw = bytearray(base64.b64decode(value))
            raw[index] ^= 1
            return base64.b64encode(bytes(raw)).decode()

        def tamper(fn):
            prov = self.load()
            bundle = prov["attestation_bundles"][0]
            att = bundle["attestations"][0]
            fn(bundle, att, att["verification_material"]["transparency_entries"][0])
            return prov

        def publisher(bundle, att, entry):
            bundle["publisher"]["repository"] = "evil/yt-dlp"

        def signature(bundle, att, entry):
            att["envelope"]["signature"] = flip_b64(att["envelope"]["signature"], 20)

        def certificate(bundle, att, entry):
            vm = att["verification_material"]
            vm["certificate"] = flip_b64(vm["certificate"], 300)

        def statement(bundle, att, entry):
            st = json.loads(base64.b64decode(att["envelope"]["statement"]))
            st["subject"][0]["digest"]["sha256"] = "0" * 64
            att["envelope"]["statement"] = base64.b64encode(json.dumps(st).encode()).decode()

        def set_sig(bundle, att, entry):
            promise = entry["inclusionPromise"]
            promise["signedEntryTimestamp"] = flip_b64(promise["signedEntryTimestamp"], 30)

        def logged_time(bundle, att, entry):
            entry["integratedTime"] = "1795400000"

        def proof(bundle, att, entry):
            entry["inclusionProof"]["hashes"].reverse()

        cases = [
            ("wrong digest", self.load(), self.NAME, "0" * 64),
            ("wrong file", self.load(), "yt_dlp-2026.11.24-py3-none-any.whl", self.SHA),
            ("publisher", tamper(publisher), self.NAME, self.SHA),
            ("signature", tamper(signature), self.NAME, self.SHA),
            ("certificate", tamper(certificate), self.NAME, self.SHA),
            ("statement swap", tamper(statement), self.NAME, "0" * 64),
            ("signed entry timestamp", tamper(set_sig), self.NAME, self.SHA),
            ("logged time", tamper(logged_time), self.NAME, self.SHA),
            ("inclusion proof", tamper(proof), self.NAME, self.SHA),
            ("empty", {"version": 1, "attestation_bundles": []}, self.NAME, self.SHA),
        ]
        for label, prov, name, sha in cases:
            with self.assertRaises(provenance.AttestationError, msg=label):
                provenance.verify_provenance(prov, name, sha)


if __name__ == "__main__":
    unittest.main(verbosity=1)

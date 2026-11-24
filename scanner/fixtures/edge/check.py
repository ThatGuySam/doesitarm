#!/usr/bin/env python3
"""Check the behavior of small, generated reproductions through the CLI."""

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
from threading import Thread

ROOT = Path(__file__).resolve().parent
XZ = {"ammonite", "backuploupe", "imageoptim", "launchcontrol"}


def scan(cli, artifact, *flags):
    result = subprocess.run([cli, "scan", artifact, "--json", *flags], capture_output=True, text=True, check=False)
    return json.loads(result.stdout)


class MixedRanges(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def do_GET(self):
        artifact = self.server.artifact
        first = self.headers.get("Range") == "bytes=0-0"
        self.send_response(206 if first else 200)
        self.send_header("Content-Length", str(1 if first else len(artifact)))
        self.send_header("Connection", "close")
        self.send_header("ETag", '"scanner-edge-fixture"')
        if first:
            self.send_header("Content-Range", f"bytes 0-0/{len(artifact)}")
        self.end_headers()
        try:
            self.wfile.write(artifact[:1] if first else artifact)
        except (BrokenPipeError, ConnectionResetError):
            pass


def check_transport(cli, artifact, format_):
    payload = artifact.read_bytes()
    with HTTPServer(("127.0.0.1", 0), MixedRanges) as server:
        server.artifact = payload
        listener = Thread(target=server.serve_forever, daemon=True)
        listener.start()
        try:
            url = f"http://127.0.0.1:{server.server_address[1]}/artifact"
            result = scan(cli, url, "--allow-http", "--allow-stream", "--budget", "262144")
            assert result["status"] == "complete" and result["format"] == format_, result
            assert result["source_transport"] == "stream" and result["reads"] >= 3, result
            assert result["bytes_requested"] > result["bytes_read"], result
        finally:
            server.shutdown()
            listener.join()


def verify(token, artifact, cli):
    if token in ("baretorrent", "wordpresscom-studio"):
        check_transport(cli, artifact, "dmg" if token == "baretorrent" else "zip")
    elif token == "codeql-bundle":
        result = scan(cli, artifact, "--binary-path", "codeql/codeql")
        assert result["format"] == "tar.zst", result
        assert result["error"] == "unsupported: declared executable is a script", result
        limited = scan(cli, artifact, "--profile", "worker", "--binary-path", "codeql/codeql")
        assert limited["error"] == "scan limit: Zstandard decoder window limit reached", limited
    elif token in ("cursor-cli", "terminal-browser"):
        path, expected = {
            "cursor-cli": ("dist-package/cursor-agent", "dist-package/node"),
            "terminal-browser": ("terminal-browser/bin/terminal-browser", "terminal-browser/electron/terminal-browser.app/Contents/MacOS/terminal-browser"),
        }[token]
        result = scan(cli, artifact, "--binary-path", path)
        assert result["error"] == "unsupported: declared executable is a script" and not result["architectures"], result
        runtime = result["script_runtime"]
        assert runtime["path"] == expected and all(arch["header_verified"] for arch in runtime["architectures"]), result
        assert runtime["architectures"]
    elif token == "prolific-pl2303":
        result = scan(cli, artifact)
        assert result["format"] == "7z", result
        assert result["nested_artifacts"] == ["PL2303HXD_G_Mac Driver_v2.2.11_20250314.pkg"], result
        assert result["installer"] is not None and result["bundle_path"] is None, result
    else:
        result = scan(cli, artifact)
        assert result["status"] == "complete", result
        assert result["architectures"] and all(arch["header_verified"] for arch in result["architectures"]), result
        if token in XZ:
            assert result["format"] == "tar.xz", result
            limited = scan(cli, artifact, "--profile", "worker")
            assert limited["error"] == "scan limit: LZMA decoder memory limit reached", limited
        elif token == "browserstacklocal":
            assert result["executable_resolution"] == "contents_relative", result
            assert result["executable_name"] == "MacOS/BrowserStackLocal.app"
        elif token == "tiptoi-manager":
            assert result["bundle_path"] == "Applications/tiptoi® Manager.app", result
            assert result["installer"]["install_location"] == "/Applications/tiptoi® Manager.app"
        elif token == "mailmate@beta":
            assert result["format"] == "tar.bz2" and result["bundle_path"] == "MailMate.app", result
        elif token == "qt-design-studio":
            assert result["format"] == "7z" and result["bundle_path"] == "Qt Design Studio.app", result
        elif token == "steam":
            assert result["format"] == "zip" and result["nested_artifacts"] == ["SteamMacBootstrapper.tar.gz"], result
        elif token in ("cave-story", "ipaverse"):
            expected = "Doukutsu.app" if token == "cave-story" else "ipaverse.app"
            assert result["format"] == "dmg" and result["bundle_path"] == expected, result
        elif token in ("soothe2", "fabfilter-pro-ds", "fabfilter-timeless"):
            assert result["bundle_kind"] == "audio_plugin", result
        elif token == "android-studio":
            inventory = result["inventory"]
            assert inventory["complete"] and inventory["all_arm64_capable"] is False, inventory
            assert set(inventory["x86_64_only"]) == {
                "Contents/jbr/Contents/Home/bin/java",
                "Contents/jbr/Contents/Home/lib/server/libjvm.dylib",
            }, inventory
            assert {binary["role"] for binary in inventory["binaries"]} >= {
                "main", "helper", "framework", "library", "updater", "plugin", "xpc_service",
                "login_item", "launch_helper", "nested_app", "resource", "shared_support", "runtime",
            }, inventory
            assert len(result["architectures"]) == 2, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cli", required=True, type=Path)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("tokens", nargs="*")
    args = parser.parse_args()
    tokens = args.tokens or sorted(path.parent.name for path in ROOT.glob("*/fixture.sh"))
    for token in tokens:
        with tempfile.TemporaryDirectory() as directory:
            artifact = Path(directory) / "artifact"
            subprocess.run([ROOT / token / "fixture.sh", artifact], check=True)
            assert artifact.stat().st_size < 2 * 1024 * 1024
            if args.baseline:
                try:
                    verify(token, artifact, args.baseline.resolve())
                except (AssertionError, KeyError):
                    pass
                else:
                    raise AssertionError(f"{token} unexpectedly passed on the baseline")
            verify(token, artifact, args.cli.resolve())
            print(f"{token}: {artifact.stat().st_size:,} bytes passed")


if __name__ == "__main__":
    main()

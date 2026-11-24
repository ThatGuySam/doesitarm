"""Exercise the cask scoreboard without contacting download hosts."""
import json
from pathlib import Path
import subprocess
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import climb


class ScoreboardTests(unittest.TestCase):
    def test_transport_taxonomy_preserves_distinct_http_failures(self):
        entry = {"declared_apps": []}
        cases = [
            ("source_error", "source: HTTP 200 OK (expected 206)", "host_200_to_range"),
            ("source_error", "source: HTTP 403 Forbidden", "http_403"),
            ("source_error", "source: HTTP 404 Not Found", "http_404"),
            ("unsupported", "unsupported: PKG Payload compression", "unsupported_codec"),
            ("unsupported", "unsupported: declared executable is a script", "script_executable"),
            ("budget_exhausted", "byte budget reached", "budget_hit"),
        ]
        for status, error, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(climb.category(entry, {"status": status, "error": error}), expected)

    def test_hint_agreement_needs_verified_actual_architectures(self):
        entry = {"architecture_hints": [
            {"source": "URL path", "expected": ["arm64"], "match": "all"},
            {"source": "depends_on.arch", "expected": ["x86_64"], "match": "any"},
        ]}
        scan = {"architectures": [
            {"name": "arm64e", "header_verified": True},
            {"name": "x86_64", "header_verified": False},
        ]}
        verdicts = lambda category: [hint["verdict"] for hint in climb.comparisons(entry, scan, category)]
        self.assertEqual(verdicts("verified"), ["agrees", "disagrees"])
        self.assertEqual(verdicts("budget_hit"), ["inconclusive", "inconclusive"])

    def test_checkpoint_recovers_the_last_complete_record(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "checkpoint.ndjson"
            first = {"cask": "example"}
            path.write_text(json.dumps(first) + '\n{"cask": "interrupted')
            self.assertEqual(climb.checkpoint_rows(path), [first])
            self.assertEqual(path.read_text(), json.dumps(first) + "\n")

    def test_campaign_deadline_leaves_interrupted_artifact_pending(self):
        entry = {"url": "https://example.invalid/artifact"}
        with patch.object(climb.subprocess, "run", side_effect=subprocess.TimeoutExpired("scan", 0.01)):
            with self.assertRaises(climb.DeadlineReached):
                climb.attempt("fake-cli", entry, 1024, 30, [], deadline=time.time() + 0.1)
            self.assertEqual(climb.attempt("fake-cli", entry, 1024, 30, [])["category"], "timeout")

    def test_nested_package_can_escalate_a_disk_image_budget(self):
        args = SimpleNamespace(cli="fake-cli", budget=8, timeout=30, cli_option=[], stop_at=None, escalate=[64])
        entry = {"expected_format": "dmg"}
        nested_budget = {
            "category": "budget_hit",
            "scan": {"format": "dmg", "nested_artifacts": ["Fixture.pkg"]},
        }
        completed = {"category": "verified", "scan": {"format": "dmg"}}
        with patch.object(climb, "attempt", side_effect=[nested_budget, completed]) as attempt:
            self.assertEqual(climb.attempts_for(args, entry, None), [nested_budget, completed])
        self.assertEqual([call.args[2] for call in attempt.call_args_list], [8, 64])


if __name__ == "__main__":
    unittest.main()

"""Append-only event log in R2 (updater only).

Each event is its own object under events/<date>/, so history cannot be lost by a
bad read-modify-write. events/summary.json keeps counts and the last 50 events for
/admin/status. Kinds: pointer_changed, canary_failed, candidate_rejected,
daily_error, egress_blocked, snapshot_held, snapshot_published, extractor_invalid.
"""

import json
import random
import time

SUMMARY_KEY = "events/summary.json"
RECENT = 50


async def record(bucket, kind, detail):
    from wutil import js_obj, now_iso, r2_json
    at = now_iso()
    event = {"at": at, "kind": kind, "detail": detail}
    try:
        suffix = f"{random.getrandbits(32):08x}"
        await bucket.put(f"events/{at[:10]}/{at}-{kind}-{suffix}.json", json.dumps(event),
                         js_obj({"httpMetadata": {"contentType": "application/json"}}))
        summary = await r2_json(bucket, SUMMARY_KEY) or {"counts": {}, "recent": []}
        summary["counts"][kind] = summary["counts"].get(kind, 0) + 1
        summary["recent"] = [event, *summary.get("recent", [])][:RECENT]
        summary["updated"] = at
        await bucket.put(SUMMARY_KEY, json.dumps(summary),
                         js_obj({"httpMetadata": {"contentType": "application/json"}}))
    except Exception as err:  # noqa: BLE001 - logging must never break the job
        print("event log failed", kind, err)
    return event


async def summary(bucket):
    from wutil import r2_json
    data = await r2_json(bucket, SUMMARY_KEY) or {"counts": {}, "recent": []}
    since = time.time() - 7 * 86400
    data["last_7_days"] = {}
    for event in data.get("recent", []):
        if _epoch(event.get("at")) >= since:
            data["last_7_days"][event["kind"]] = data["last_7_days"].get(event["kind"], 0) + 1
    data["recent"] = data.get("recent", [])[:15]
    return data


def _epoch(text):
    import calendar
    try:
        return calendar.timegm(time.strptime(text, "%Y-%m-%dT%H:%M:%SZ"))
    except (TypeError, ValueError):
        return 0

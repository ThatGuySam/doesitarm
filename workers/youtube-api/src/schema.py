"""Strict validation of extractor output, run by trusted code (API and updater).

The extractor runs third-party code, so its JSON is untrusted. Only known fields
with the expected types and bounds pass; everything else is dropped. Fields the
trusted side can derive (URLs, timestamps) are rebuilt here, not copied.
"""

import re

from normalize import parse_timestamps, valid_playlist_id, valid_video_id

CHANNEL_ID_RE = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
UPLOAD_DATE_RE = re.compile(r"^\d{8}$")
THUMB_HOSTS = ("https://i.ytimg.com/", "https://i9.ytimg.com/", "https://yt3.ggpht.com/")
MAX_TITLE = 300
MAX_DESCRIPTION = 12000
MAX_TAGS = 120
MAX_TAG = 120
MAX_ITEMS = 5000


class InvalidOutput(ValueError):
    pass


def _bad(message):
    raise InvalidOutput(message)


def _text(value, limit, field, allow_none=True):
    if value is None and allow_none:
        return None
    if not isinstance(value, str):
        _bad(f"{field} must be a string")
    if len(value) > limit:
        _bad(f"{field} is longer than {limit} characters")
    return value


def _number(value, field, upper=10 ** 10):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= upper:
        _bad(f"{field} must be a non-negative number")
    return value


def _thumbnail(value):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 500 or not value.startswith(THUMB_HOSTS):
        return None
    return value


def video(data, expected_id):
    if not isinstance(data, dict):
        _bad("video must be an object")
    if data.get("id") != expected_id or not valid_video_id(expected_id):
        _bad("video id does not match the request")
    title = _text(data.get("title"), MAX_TITLE, "title", allow_none=False)
    if not title.strip():
        _bad("title is empty")
    description = _text(data.get("description") or "", MAX_DESCRIPTION, "description")
    tags = data.get("tags") or []
    if not isinstance(tags, list) or len(tags) > MAX_TAGS:
        _bad("tags must be a short list")
    tags = [_text(t, MAX_TAG, "tag", allow_none=False) for t in tags]
    categories = data.get("categories") or []
    if not isinstance(categories, list) or len(categories) > 10:
        _bad("categories must be a short list")
    categories = [_text(c, MAX_TAG, "category", allow_none=False) for c in categories]
    upload_date = data.get("upload_date")
    if upload_date is not None and not (isinstance(upload_date, str) and UPLOAD_DATE_RE.match(upload_date)):
        _bad("upload_date must be YYYYMMDD")
    channel_id = data.get("channel_id")
    if channel_id is not None and not (isinstance(channel_id, str) and CHANNEL_ID_RE.match(channel_id)):
        channel_id = None
    out = {
        "id": expected_id,
        "title": title,
        "description": description,
        "timestamps": parse_timestamps(description),
        "tags": tags,
        "categories": categories,
        "duration": _number(data.get("duration"), "duration"),
        "upload_date": upload_date,
        "timestamp": _number(data.get("timestamp"), "timestamp"),
        "channel": _text(data.get("channel"), 200, "channel"),
        "channel_id": channel_id,
        "thumbnail": _thumbnail(data.get("thumbnail")),
        "url": f"https://www.youtube.com/watch?v={expected_id}",
    }
    out["complete"] = bool(out["title"] and out["duration"] and out["upload_date"])
    return out


def playlist(data, expected_id, limit=MAX_ITEMS):
    if not isinstance(data, dict):
        _bad("playlist must be an object")
    if data.get("id") != expected_id or not valid_playlist_id(expected_id):
        _bad("playlist id does not match the request")
    items = data.get("items")
    if not isinstance(items, list) or len(items) > min(limit, MAX_ITEMS):
        _bad("items must be a list within the limit")
    clean = []
    seen = set()
    for position, item in enumerate(items):
        if not isinstance(item, dict) or not valid_video_id(item.get("id")):
            _bad(f"item {position} has no valid video id")
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        index = item.get("index")
        if isinstance(index, bool) or not isinstance(index, int) or not 1 <= index <= 100000:
            _bad(f"item {position} has no valid index")
        channel_id = item.get("channel_id")
        clean.append({
            "index": index,
            "id": item["id"],
            "title": _text(item.get("title"), MAX_TITLE, "item title"),
            "url": f"https://www.youtube.com/watch?v={item['id']}",
            "duration": _number(item.get("duration"), "item duration"),
            "channel": _text(item.get("channel"), 200, "item channel"),
            "channel_id": channel_id if isinstance(channel_id, str) and CHANNEL_ID_RE.match(channel_id) else None,
        })
    owner_id = data.get("channel_id")
    return {
        "id": expected_id,
        "title": _text(data.get("title"), MAX_TITLE, "playlist title"),
        "channel": _text(data.get("channel"), 200, "playlist channel"),
        "channel_id": owner_id if isinstance(owner_id, str) and CHANNEL_ID_RE.match(owner_id) else None,
        "count": len(clean),
        "items": clean,
    }

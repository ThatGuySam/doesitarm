"""Input validation and output shaping. Pure Python so it runs under CPython tests."""

import re

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
# Playlist IDs: user playlists (PL), uploads (UU), favourites (FL), likes (LL),
# mixes (RD) and album playlists (OLAK5uy_). Length bounds are generous but finite.
PLAYLIST_ID_RE = re.compile(r"^(?:PL|UU|FL|LL|RD|OL)[A-Za-z0-9_-]{10,62}$")
VERSION_RE = re.compile(r"^\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d{1,6})?(?:\.dev\d+)?$")

# Same pattern as the removed JavaScript reader (helpers/api/youtube/build.js).
TIMESTAMP_RE = re.compile(r"(?:([0-5]?[0-9]):)?([0-5]?[0-9]):([0-5][0-9])")

DEFAULT_PLAYLIST_LIMIT = 50
MAX_PLAYLIST_LIMIT = 200
# Internal (updater) limit for whole source playlists.
MAX_SOURCE_PLAYLIST = 3000


class BadInput(ValueError):
    pass


def valid_video_id(value):
    return isinstance(value, str) and bool(VIDEO_ID_RE.match(value))


def valid_playlist_id(value):
    return isinstance(value, str) and bool(PLAYLIST_ID_RE.match(value))


def valid_version(value):
    return isinstance(value, str) and bool(VERSION_RE.match(value))


def require_video_id(value):
    if not valid_video_id(value):
        raise BadInput("id must be an 11-character YouTube video ID")
    return value


def require_playlist_id(value):
    if not valid_playlist_id(value):
        raise BadInput("id must be a YouTube playlist ID (PL..., UU..., OLAK5uy_...)")
    return value


def parse_limit(value):
    if value in (None, ""):
        return DEFAULT_PLAYLIST_LIMIT
    if not str(value).isdigit():
        raise BadInput(f"limit must be an integer from 1 to {MAX_PLAYLIST_LIMIT}")
    limit = int(value)
    if not 1 <= limit <= MAX_PLAYLIST_LIMIT:
        raise BadInput(f"limit must be an integer from 1 to {MAX_PLAYLIST_LIMIT}")
    return limit


def parse_timestamps(description):
    """Return [{time, fullText}] for every description line holding a timestamp."""
    if not description or not description.strip():
        return []
    stamps = []
    for line in re.split(r"\r?\n", description):
        match = TIMESTAMP_RE.search(line)
        if match is None:
            continue
        stamps.append({"time": match.group(0), "fullText": line})
    return stamps


def _thumbnail(info):
    if info.get("thumbnail"):
        return info["thumbnail"]
    thumbs = [t for t in info.get("thumbnails") or [] if t.get("url")]
    if not thumbs:
        return None
    return max(thumbs, key=lambda t: (t.get("preference") or 0, t.get("width") or 0))["url"]


def normalize_video(info):
    description = info.get("description") or ""
    return {
        "id": info.get("id"),
        "title": info.get("title"),
        "description": description,
        "timestamps": parse_timestamps(description),
        "tags": list(info.get("tags") or []),
        "categories": list(info.get("categories") or []),
        "duration": info.get("duration"),
        "upload_date": info.get("upload_date"),
        "timestamp": info.get("timestamp") or info.get("release_timestamp"),
        "channel": info.get("channel") or info.get("uploader"),
        "channel_id": info.get("channel_id"),
        "thumbnail": _thumbnail(info),
        "url": f"https://www.youtube.com/watch?v={info.get('id')}",
    }


def normalize_playlist(info, limit):
    items = []
    for index, entry in enumerate(info.get("entries") or [], start=1):
        if entry is None:
            continue
        video_id = entry.get("id")
        if not valid_video_id(video_id):
            continue
        items.append({
            "index": index,
            "id": video_id,
            "title": entry.get("title"),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "duration": entry.get("duration"),
            "channel": entry.get("channel") or entry.get("uploader"),
            "channel_id": entry.get("channel_id"),
        })
        if len(items) >= limit:
            break
    return {
        "id": info.get("id"),
        "title": info.get("title"),
        "channel": info.get("channel") or info.get("uploader"),
        "channel_id": info.get("channel_id") or info.get("uploader_id"),
        "count": len(items),
        "items": items,
    }

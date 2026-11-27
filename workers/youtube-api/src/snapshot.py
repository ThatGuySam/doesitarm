"""Build the Does It ARM video snapshot (a drop-in for the old VIDEO_SOURCE file).

Pure Python: the updater supplies extractor results, tests supply fakes.

Output shape, keyed by video ID, exactly as the old YouTube Data API reader wrote it
(helpers/api/youtube/build.js before 63b5534), so helpers/build-video-list.js reads
it unchanged:

    {"<videoId>": {"title", "description", "timestamps": [{"time", "fullText"}],
                   "tags": ["benchmark"]?,
                   "rawData": {"kind": "youtube#playlistItem",
                               "snippet": {publishedAt, channelId, title, description,
                                           thumbnails{default,medium,high,standard},
                                           channelTitle, playlistId, position,
                                           resourceId{kind, videoId},
                                           videoOwnerChannelTitle, videoOwnerChannelId},
                               "contentDetails": {videoId, videoPublishedAt}}}}

As before, snippet.channelTitle/channelId name the playlist owner and the video's
own channel is in videoOwnerChannel*. One difference: yt-dlp cannot see when a video
was added to a playlist, so publishedAt for new videos is the video's publish date
(entries carried over from the old snapshot keep their original values).

Storage: entries live in SHARDS JSON files (snapshot/shards/NN.json, by a hash of
the video ID) so a run only parses the shards it changes; Pyodide cannot hold the
whole 11 MB file as Python objects within the 128 MB isolate limit. The published
file is the shards' bytes joined without parsing (join_shards).

State (internal, R2 snapshot/state.json):
    {"playlists": {pid: {"ids": [...], "title", "owner", "owner_id", "ok_at", "error", "error_at"}},
     "videos": {vid: {"h": last extraction epoch, "f": failures, "e": last class,
                      "s": 1 if an entry is stored, "gone": bool}},
     "last_sweep": epoch}
"""

import hashlib
import time

from normalize import parse_timestamps

SHARDS = 32
REFRESH_SECONDS = 90 * 86400
GONE_AFTER_FAILURES = 3
MIN_COVERAGE = 0.9          # publish only if at least 90% of the previous video count
MAX_PLAYLIST_SHRINK = 0.5   # ignore a sweep that loses more than half a playlist
THUMBNAILS = (("default", "default", 120, 90), ("medium", "mqdefault", 320, 180),
              ("high", "hqdefault", 480, 360), ("standard", "sddefault", 640, 480))


def empty_state():
    return {"playlists": {}, "videos": {}, "last_sweep": 0}


def seed_state(old_snapshot, sources, now):
    """State for a snapshot carried over from the old reader: membership from each
    entry's playlistId (plus tagged playlists from the entry's tags)."""
    state = empty_state()
    tagged = {tag: s["id"] for s in sources for tag in s.get("tags", [])}
    for vid, entry in old_snapshot.items():
        snippet = (entry.get("rawData") or {}).get("snippet") or {}
        pids = {snippet.get("playlistId")} | {tagged[t] for t in entry.get("tags", []) if t in tagged}
        for pid in filter(None, pids):
            pl = state["playlists"].setdefault(pid, {"ids": [], "seeded": True})
            pl["ids"].append(vid)
            if pid == snippet.get("playlistId") and not pl.get("owner"):
                pl["owner"], pl["owner_id"] = snippet.get("channelTitle"), snippet.get("channelId")
        # Spread first refreshes of carried-over entries over the refresh window.
        spread = int(hashlib.sha256(vid.encode("utf-8")).hexdigest()[:12], 16) % REFRESH_SECONDS
        state["videos"][vid] = {"h": now - REFRESH_SECONDS + spread, "f": 0, "s": 1,
                                "p": snippet.get("publishedAt")}
    return state


def apply_sweep(state, pid, playlist, now):
    """Record a validated playlist listing. Returns a note when the listing is ignored."""
    entry = state["playlists"].setdefault(pid, {"ids": []})
    ids = [item["id"] for item in playlist["items"]]
    previous = entry.get("ids") or []
    if previous and len(ids) < len(previous) * MAX_PLAYLIST_SHRINK:
        entry.update(error=f"listing shrank from {len(previous)} to {len(ids)}; kept the previous list",
                     error_at=now)
        return entry["error"]
    entry.update(ids=ids, title=playlist.get("title"), ok_at=now, error=None, seeded=False)
    if playlist.get("channel"):
        entry["owner"] = playlist["channel"]
    if playlist.get("channel_id"):
        entry["owner_id"] = playlist["channel_id"]
    return None


def note_sweep_failure(state, pid, error, now):
    entry = state["playlists"].setdefault(pid, {"ids": []})
    entry.update(error=str(error)[:300], error_at=now)


def membership(sources, state):
    """Ordered {vid: {"playlist", "position", "tags", "owner", "owner_id"}}."""
    members = {}
    for source in sources:
        pl = state["playlists"].get(source["id"]) or {}
        for position, vid in enumerate(pl.get("ids") or []):
            member = members.get(vid)
            if member is None:
                member = members[vid] = {"playlist": source["id"], "position": position, "tags": set(),
                                         "owner": pl.get("owner"), "owner_id": pl.get("owner_id")}
            member["tags"].update(source.get("tags", []))
    return members


def shard_of(vid):
    return int(hashlib.sha256(vid.encode("utf-8")).hexdigest()[:8], 16) % SHARDS


def shard_key(index):
    return f"snapshot/shards/{index:02d}.json"


def stored(state):
    return {vid for vid, v in state["videos"].items() if v.get("s")}


def plan(members, state, snapshot, now, max_videos):
    """Pick videos to extract: new members first (in source order), then the stalest
    refreshes. Returns (new_ids, refresh_ids)."""
    videos = state["videos"]
    new_ids = [vid for vid in members
               if vid not in snapshot and not (videos.get(vid) or {}).get("gone")][:max_videos]
    room = max_videos - len(new_ids)
    due = sorted((vid for vid in members if vid in snapshot
                  and now - (videos.get(vid) or {}).get("h", 0) > REFRESH_SECONDS),
                 key=lambda vid: (videos.get(vid) or {}).get("h", 0))
    return new_ids, due[:max(room, 0)]


def _published(video):
    if video.get("timestamp"):
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(video["timestamp"])))
    date = video.get("upload_date")
    if date:
        return f"{date[0:4]}-{date[4:6]}-{date[6:8]}T00:00:00Z"
    return None


def build_entry(video, member, ytdlp_version, now):
    vid = video["id"]
    published = _published(video)
    description = video.get("description") or ""
    return {
        "title": video["title"],
        "description": description,
        "timestamps": parse_timestamps(description),
        "tags": sorted(member["tags"]),
        "rawData": {
            "kind": "youtube#playlistItem",
            "snippet": {
                "publishedAt": published,
                "channelId": member.get("owner_id") or video.get("channel_id"),
                "title": video["title"],
                "description": description,
                "thumbnails": {key: {"url": f"https://i.ytimg.com/vi/{vid}/{name}.jpg", "width": w, "height": h}
                               for key, name, w, h in THUMBNAILS},
                "channelTitle": member.get("owner") or video.get("channel"),
                "playlistId": member["playlist"],
                "position": member["position"],
                "resourceId": {"kind": "youtube#video", "videoId": vid},
                "videoOwnerChannelTitle": video.get("channel"),
                "videoOwnerChannelId": video.get("channel_id"),
            },
            "contentDetails": {"videoId": vid, "videoPublishedAt": published},
            "fetchedBy": {"tool": "yt-dlp", "version": ytdlp_version,
                          "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))},
        },
    }


def refresh_entry(entry, video, ytdlp_version, now):
    """Update text fields of an existing entry, keeping everything else."""
    description = video.get("description") or ""
    entry = {**entry, "title": video["title"], "description": description,
             "timestamps": parse_timestamps(description)}
    raw = dict(entry.get("rawData") or {})
    snippet = dict(raw.get("snippet") or {})
    snippet.update(title=video["title"], description=description)
    if video.get("channel"):
        snippet["videoOwnerChannelTitle"] = video["channel"]
    if video.get("channel_id"):
        snippet["videoOwnerChannelId"] = video["channel_id"]
    raw["snippet"] = snippet
    raw["fetchedBy"] = {"tool": "yt-dlp", "version": ytdlp_version,
                        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))}
    entry["rawData"] = raw
    return entry


def record_result(state, snapshot, members, vid, result, ytdlp_version, now, is_new):
    """Apply one validated extraction (result = {"ok", "video"} or {"ok": False, "class"})."""
    vstate = state["videos"].setdefault(vid, {"h": 0, "f": 0})
    if result.get("ok") and (is_new or vid in snapshot):
        video = result["video"]
        if is_new:
            snapshot[vid] = build_entry(video, members[vid], ytdlp_version, now)
            vstate["p"] = snapshot[vid]["rawData"]["snippet"]["publishedAt"]
        else:
            snapshot[vid] = refresh_entry(snapshot[vid], video, ytdlp_version, now)
        vstate.update(h=now, f=0, e=None, s=1)
        return
    vstate["f"] = vstate.get("f", 0) + 1
    vstate["e"] = result.get("class")
    if is_new and result.get("class") == "unavailable" and vstate["f"] >= GONE_AFTER_FAILURES:
        vstate["gone"] = True
    if not is_new:
        # Try again at the back of the refresh queue instead of every run.
        vstate["h"] = max(vstate.get("h", 0), now - REFRESH_SECONDS + 7 * 86400)


def publishable(snapshot, members):
    """The published file: current members only, tags recomputed, source order."""
    out = {}
    for vid, member in members.items():
        entry = snapshot.get(vid)
        if entry is None:
            continue
        tags = sorted(member["tags"])
        if entry.get("tags") != tags:
            entry = {**entry, "tags": tags}
        out[vid] = entry
    return out


def fix_shard(shard, members, state):
    """Drop entries that are no longer members and recompute tags. Returns changed."""
    changed = False
    for vid in list(shard):
        member = members.get(vid)
        if member is None:
            del shard[vid]
            state["videos"].setdefault(vid, {})["s"] = 0
            changed = True
            continue
        tags = sorted(member["tags"])
        if shard[vid].get("tags") != tags:
            shard[vid] = {**shard[vid], "tags": tags}
            changed = True
    return changed


def join_shards(parts):
    """Join JSON object texts (bytes) into one object without parsing them."""
    bodies = []
    for part in parts:
        body = part.strip()
        if not body.startswith(b"{") or not body.endswith(b"}"):
            raise ValueError("shard is not a JSON object")
        body = body[1:-1].strip()
        if body:
            bodies.append(body)
    return b"{" + b",".join(bodies) + b"}"


def coverage_ok(previous_count, new_count):
    return previous_count == 0 or new_count >= previous_count * MIN_COVERAGE


def newest_published(snapshot):
    dates = [((e.get("rawData") or {}).get("snippet") or {}).get("publishedAt") or "" for e in snapshot.values()]
    return max(dates) if dates else None


def summary(state, members):
    """Video count and newest publishedAt of the published file, from state alone."""
    videos = state["videos"]
    present = [vid for vid in members if (videos.get(vid) or {}).get("s")]
    dates = [videos[vid].get("p") or "" for vid in present]
    return len(present), (max(dates) if dates else None)

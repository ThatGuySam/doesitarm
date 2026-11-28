# doesitarm-youtube (three Workers)

A small YouTube read API and a daily video snapshot for Does It ARM. It runs
**unmodified yt-dlp** as Python on Cloudflare Workers. It replaces the YouTube Data
API reader removed in `5442471` and `63b5534`.

- Public API: <https://youtube.doesitarm.com> (also <https://doesitarm-youtube-api.samcarlton.workers.dev>)
- Video snapshot: <https://youtube.doesitarm.com/snapshot/youtube-videos.json>
- Security model and residual risks: [SECURITY.md](SECURITY.md)

## Architecture

```
            public                     service bindings only
client ──▶ doesitarm-youtube-api ──────────────▶ doesitarm-youtube-extract (JS host, LOADER only)
            (cache KV, rate limits,   │                │ Worker Loader
             schema validation)       │                ▼
                                      │        yt-dlp Dynamic Worker (Python)
                                      │        env: wheel labels only
                                      │        egress: YouTubeGateway (YouTube hosts only)
                                      ▼                ▲
            doesitarm-youtube-updater ─────────────────┘
            (cron, pointer KV, R2, UPDATER_KEY; never imports yt-dlp)
```

| Worker | Code | Bindings | Route |
| --- | --- | --- | --- |
| `doesitarm-youtube-api` | `src/api.py` (`api/wrangler.jsonc`) | KV `doesitarm-youtube-cache` (cache only), services EXTRACT and UPDATER, 2 rate limits, var `PLAYER_CLIENT` | `youtube.doesitarm.com` custom domain + workers.dev |
| `doesitarm-youtube-updater` | `src/updater.py` (`updater/wrangler.jsonc`) | KV `doesitarm-youtube-pointers`, R2 `doesitarm-youtube-wheels`, service EXTRACT, secret `UPDATER_KEY`, var `PLAYER_CLIENT` | workers.dev, `/admin/*` only (key) |
| `doesitarm-youtube-extract` | `extract/host.js` + `src/sandbox.py`, `extract.py`, `transport.py`, `loader.py`, `canary.py`, `normalize.py` | Worker Loader only | none |

Shared pure-Python modules: `normalize.py` (IDs, timestamps), `schema.py` (strict
validation of extractor output), `canary.py` (suite, failure classes, decisions),
`release.py` (which release, static wheel checks), `provenance.py` (PEP 740 /
Sigstore verification), `snapshot.py` (snapshot logic), `sources.py` (snapshot
playlists), `events.py` (R2 event log), `wutil.py` (Worker helpers), `bundled.py`
(generated: bundled wheel facts).

### The extractor sandbox

`extract/host.js` receives a job (one line of JSON, a newline, optional wheel bytes)
and runs it in a Python Dynamic Worker:

- ID `yt-extract:<code hash>:<wheel sha256>`: each yt-dlp version gets its own isolates.
- `env` holds only `WHEEL_VERSION`, `WHEEL_SHA256`, `WHEEL_SOURCE`. The wheel bytes
  come in the request body (Dynamic Worker env is capped at 1 MB); the sandbox writes
  them to `/tmp` and zipimports them. The bundled wheel is a Data module of the host.
- `globalOutbound` is `YouTubeGateway`: the runtime sends every `fetch()` and
  `connect()` from the sandbox there. It passes only `https` to `youtube.com`,
  `www.youtube.com`, `m.youtube.com`, `consent.youtube.com` on port 443, refuses raw
  sockets, and reports blocked hosts back as `egress_blocked` (logged by the callers).
- If a requested wheel fails to import, the job reruns on the bundled wheel and says
  so in `ytdlp.fallback_reason` (a canary then fails).

Inside the sandbox yt-dlp uses `WorkerFetchRH` (`src/transport.py`), a yt-dlp
`RequestHandler` that sends each request through JavaScript `fetch` and waits with
`pyodide.ffi.run_sync` (JSPI). It keeps yt-dlp's cookie jar, follows redirects by hand
with the same host allowlist on every hop, drops cookie/auth headers across origins,
caps bodies at 8 MiB and requests per job, and reports `google.com/sorry` redirects as
a bot check. yt-dlp is imported per request because it calls `random` at import time.

Python Workers note: the Workers SDK's binding wrapper walks every argument element
by element, so a multi-megabyte body costs minutes of CPU. Large R2 writes and
service-binding calls go through the raw JavaScript binding (`wutil.raw`).

## API

All responses are JSON with `access-control-allow-origin: *`. Only `id` and `limit`
are accepted.

| Route | Returns |
| --- | --- |
| `GET /playlist?id=PL...&limit=50` | `{id, title, channel, channel_id, count, items: [{index, id, title, url, duration, channel, channel_id}], meta}`. `limit` 1 to 200 (default 50). Fetched and cached at 200, then sliced. |
| `GET /video?id=VIDEOID` | `{id, title, description, timestamps: [{time, fullText}], tags, categories, duration, upload_date, timestamp, channel, channel_id, thumbnail, url, complete, meta}` |
| `GET /snapshot/youtube-videos.json` | The video snapshot (below). Headers `x-snapshot-videos`, `x-snapshot-generated`, `x-snapshot-newest`. |
| `GET /health` | `{ok, ytdlp: {version, source}}` |

`meta`: `fetched_at`, `ytdlp {version, source}`, `player_client`, `requests`,
`elapsed_ms`, `cache` (`hit`, `miss`, `stale`). Cache: KV, fresh for 6 h (videos) or
1 h (playlists), kept 30 days and served `stale` when YouTube fails. Failures are cached
for 60 s. Cache misses are rate limited per IP (10/min) and in total (60/min) per
Cloudflare location; over the limit you get the stale copy or 429. Extractor output is
validated by `schema.py` before it is cached; URLs and timestamps are rebuilt by the API.

## Video snapshot

`https://youtube.doesitarm.com/snapshot/youtube-videos.json` is a drop-in for the old
`VIDEO_SOURCE` file (`helpers/api/youtube/build.js`, read by
`helpers/build-video-list.js`): an object keyed by video ID with `title`,
`description`, `timestamps`, `tags` (`benchmark` for videos in a playlist tagged
`benchmark`) and `rawData` (`kind`, `snippet.{publishedAt, channelId, title,
description, thumbnails{default, medium, high, standard}, channelTitle, playlistId,
position, resourceId, videoOwnerChannelTitle, videoOwnerChannelId}`,
`contentDetails.{videoId, videoPublishedAt}`, plus `fetchedBy`). As in the old file,
`channelTitle`/`channelId` are the playlist owner. Difference: new videos get the video
publish date (midnight UTC of the upload date) as `publishedAt`, because yt-dlp cannot
see the add-to-playlist date. Entries carried over from the last old file (2,246
videos, newest 2023-01-19) keep their original data until refreshed.

**Sources:** `src/sources.py`. Add a playlist (`{"id", "name", "tags"?}`; `"tags":
["benchmark"]` feeds the benchmark tag), deploy the updater (`cd updater && $W
deploy`), then run a snapshot step with `sweep=1` (below) or wait for the 01:37 UTC
sweep. Three historical playlists no longer exist on YouTube (status lists them under
`playlists_failing`); their last known videos are kept.

**How it updates** (`snapshot_step` in `src/updater.py`):

- Daily at 01:37 UTC, ahead of the API rebuild: check for a yt-dlp release, then sweep
  every source playlist (flat listing, one extractor call each). A failed or sharply
  shrunk listing keeps the previous list.
- After the sweep, extract up to 40 videos (batches of 20): new videos first, then
  entries due for refresh (every 90 days; carried-over entries are spread over that
  window). It stops early if YouTube starts challenging the egress. A new video that is
  unavailable three times is skipped for good.
- Entries live in 32 shards (`snapshot/shards/NN.json` in R2); a run rewrites only the
  shards it changed and publishes the shards joined without parsing (Pyodide cannot
  hold the 11 MB file as Python objects in a 128 MB isolate).
- Publishing is skipped, and `snapshot_held` logged, if the video count would drop
  below 90% of the previous count. The previous file is kept as
  `snapshot/youtube-videos.prev.json`. Status: `snapshot/status.json` and `/admin/status`.

## Releases: how yt-dlp updates itself

Daily at 01:37 UTC, before refreshing the snapshot, the updater:

1. Picks the newest **stable** PyPI release that is at least **3 days old** and
   **strictly newer** than the active and bundled versions (`release.pick_release`).
2. Requires a valid **PEP 740 attestation** for the exact wheel digest from GitHub
   `yt-dlp/yt-dlp`, workflow `release.yml` (`provenance.py`): publisher, statement
   subject (file name and SHA-256), DSSE signature, Fulcio certificate chained to a
   pinned intermediate with the release-workflow identity and GitHub OIDC issuer, and
   the Rekor entry (signed entry timestamp, inclusion proof, signed checkpoint, logged
   within the certificate's validity). Nightlies fail this (they come from
   `release-nightly.yml`).
3. Downloads the wheel from `files.pythonhosted.org` (10 MB cap), checks SHA-256 and
   static rules (`release.check_wheel`: only `yt_dlp/`, its dist-info and data/share,
   no `.pth` or native files, size and file count within 25% of the bundled wheel,
   METADATA and `version.py` match), then stores it in R2. Nothing before this point
   imports it.
4. Runs the canary suite (3 playlists, 3 videos) in the sandbox for the active version
   and the candidate, and promotes a candidate that passes all six. If the active wheel
   fails for yt-dlp reasons while the **bundled copy** passes, it rolls back to bundled.
   The bundled copy is the only rollback target; no wheel ever becomes one.

Only the cron promotes. Pointers: KV `doesitarm-youtube-pointers` (`pointer:active`,
`wheel:<version>`, `run:latest`, `run:index`); run records in R2 `runs/`; events in R2
`events/` (`pointer_changed`, `canary_failed`, `candidate_rejected`, `daily_error`,
`egress_blocked`, `extractor_invalid`, `snapshot_held`, `snapshot_published`), counted in
`/admin/status`.

## Operations

Commands run from `workers/youtube-api/`. Wrangler on omarchy:
`W="node /home/tiki/.npm/_npx/c943b712072b77c4/node_modules/wrangler/bin/wrangler.js"`.
The admin key is in `~/.config/doesitarm-youtube-api/updater-key` (mode 600).

```sh
./scripts/vendor.sh                       # pinned wheels: extract/bundled.whl, python_modules, src/bundled.py
python3 -I tests/test_units.py            # CPython unit tests
(cd extract && $W deploy)                 # deploy order: extract, updater, api
(cd updater && $W deploy)
(cd api && $W deploy)
(cd updater && $W secret put UPDATER_KEY < ~/.config/doesitarm-youtube-api/updater-key)   # once / rotation

U=https://doesitarm-youtube-updater.samcarlton.workers.dev
K=$(cat ~/.config/doesitarm-youtube-api/updater-key)
curl -H "x-admin-key: $K" $U/admin/status                                   # pointers, runs, events, snapshot
curl -X POST -H "x-admin-key: $K" "$U/admin/snapshot-step?sweep=1&max=40"   # sweep + extract now
curl -X POST -H "x-admin-key: $K" "$U/admin/snapshot-step?max=100"          # extract pending videos
curl -X POST -H "x-admin-key: $K" $U/admin/run-daily                        # release job, dry run (never promotes)
curl -X POST -H "x-admin-key: $K" "$U/admin/check-release?version=2026.11.23"  # attestation + static checks only
curl -X POST -H "x-admin-key: $K" "$U/admin/stage-release?version=X&canary=1"  # vet, store, canary; no promotion
curl -X POST -H "x-admin-key: $K" "$U/admin/extract?id=VIDEOID&ytdlp=bundled"  # debug one extraction
curl -X POST -H "x-admin-key: $K" $U/admin/rollback                         # back to the bundled copy
```

Reset the snapshot from a saved file: `python3 -I scripts/seed_snapshot.py OLD.json OUT`,
then upload `OUT/state.json` and `OUT/shards/*.json` to `doesitarm-youtube-wheels/snapshot/`
with `$W r2 object put ... --remote` and run a snapshot step.

To change the bundled yt-dlp: update the wheel line in `scripts/vendor.sh`, run it,
redeploy all three Workers. Routine version changes need no redeploy.

The single-Worker version's KV namespace `doesitarm-youtube-state` was deleted on
2026-11-27, along with its `CANARY_KEY` secret (replaced by `UPDATER_KEY`).

## Measured (hosted Cloudflare, 2026-11-27)

- Sandbox cold start (new isolate: Python start plus zipimport of yt-dlp): about 9 to
  11 s for the first video; warm videos 1.5 to 2.5 s; a canary suite about 9 s.
- Snapshot: sweep of 42 playlists plus 40 videos took 138 s wall in one run; 100 videos
  about 3.5 minutes. First full seed: 2,792 videos (546 new, newest 2026-11-26).
- Playlists from Cloudflare egress work. Videos need the `tv_simply,web_embedded`
  player clients: YouTube often redirects Watch pages from Cloudflare IPs to
  `google.com/sorry`, and the default client then returns "Sign in to confirm you're
  not a bot". This can change at any time; the canary then fails as
  `youtube_blocked` and versions are left alone, and the snapshot stops early.
- Not handled: signature/n-challenge solving (media URLs only), PO tokens, downloads,
  non-YouTube extractors.
- KV is eventually consistent: a pointer change can take up to a minute to reach every
  location.

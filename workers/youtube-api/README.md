# doesitarm-youtube-api

A small YouTube read API for Does It ARM. It runs **unmodified yt-dlp** inside a
Cloudflare Python Worker (Pyodide/WebAssembly). It replaces the YouTube Data API
reader removed in `5442471` and `63b5534`.

Deployed at <https://doesitarm-youtube-api.samcarlton.workers.dev> (workers.dev only,
no routes or custom domains).

## API

All responses are JSON with `access-control-allow-origin: *`.

| Route | Returns |
| --- | --- |
| `GET /playlist?id=PL...&limit=50` | `{id, title, channel, count, items: [{index, id, title, url, duration}], meta}`. Follows continuations up to `limit` (1 to 200, default 50). Flat listing, so no per-video requests. |
| `GET /video?id=VIDEOID` | `{id, title, description, timestamps: [{time, fullText}], tags, categories, duration, upload_date, channel, channel_id, thumbnail, url, complete, meta}`. `timestamps` uses the same regex as the old reader. `tags` are YouTube keywords; the Does It ARM `benchmark` tag stays a consumer concern. `complete` is false if duration or upload date is missing, which is what a partial (bot-checked) extraction looks like. |
| `GET /health` | Bundled and active yt-dlp versions, last-good pointer, player clients, what this isolate has loaded, last daily run and the last 7 runs. |

`meta` holds `fetched_at`, the yt-dlp version and source (`bundled` or `wheel`), the
number of YouTube requests, elapsed time and `cache` (`hit`, `miss`, `stale`, `bypass`).

Input validation: video IDs must be 11 characters of `[A-Za-z0-9_-]`; playlist IDs must
start with `PL`, `UU`, `FL`, `LL`, `RD` or `OL`. The transport only reaches `https`
`youtube.com`, `www.youtube.com`, `m.youtube.com` and `consent.youtube.com`, also on
redirects. Each extraction has a request budget (12 per video, about 4 + 2 per 50
playlist items).

Caching: results go to KV with a 30-day lifetime. They count as fresh for 6 hours
(videos) or 1 hour (playlists). If YouTube fails, a stale copy is served with
`meta.cache = "stale"` and the failure in `meta.stale_reason`. (The Cache API is a
no-op on workers.dev, so KV is used.)

### Privileged parameters

These need the `x-canary-key` header (the `CANARY_KEY` secret):

- `ytdlp=<version>|bundled` runs a stored candidate version.
- `player_client=a,b` overrides yt-dlp's YouTube player clients.
- `fresh=1` skips the cache; `debug=1` adds the request log and yt-dlp warnings.
- `GET /internal/canary?ytdlp=<version>` runs the canary suite for one version.
- `POST /admin/run-daily` runs the daily job as a dry run (it never promotes; only the cron does).
- `POST /admin/check-release?version=<v>` runs the attestation and static wheel checks without storing anything.

Phase 1 gates (2026-11-27): stable releases only, at least 3 days old, strictly newer than the
active version; a valid PEP 740 attestation from GitHub `yt-dlp/yt-dlp` `release.yml` for the
exact wheel digest (`src/provenance.py`, verified in pure Python against pinned Sigstore keys);
static wheel checks (`src/release.py`); the bundled copy is the only rollback target.

## How it works

- **Transport** (`src/transport.py`): yt-dlp's own transports use blocking sockets, which
  Workers lack. `WorkerFetchRH` is a yt-dlp `RequestHandler` that sends each request
  through JavaScript `fetch` and waits with `pyodide.ffi.run_sync` (JSPI). It keeps
  yt-dlp's cookie jar (reads every `Set-Cookie` via `getSetCookie()`), follows redirects
  by hand (`redirect: "manual"`, allowlist checked on every hop, 303/301/302 POST become
  GET, 307/308 keep method and body, cookie and auth headers dropped across origins, 5
  hops maximum), applies a per-request `AbortSignal` timeout, streams the body with an
  8 MiB cap, and maps non-2xx to yt-dlp `HTTPError` and failures to `TransportError`. A
  redirect to `google.com/sorry` is reported as a YouTube bot check.
  `WorkerYoutubeDL` overrides `_request_director` so no socket handler is ever used.
- **Lazy import**: yt-dlp calls `random` at import time and workerd forbids startup
  entropy, so yt-dlp is imported inside the request.
- **Versioning without a rebuild** (`src/loader.py`): `python_modules/` bundles yt-dlp
  2026.11.23 as the fallback. Any other version is a wheel in R2. The Worker reads the
  bytes, checks the SHA-256 against the pointer, writes the wheel to `/tmp`, puts it first
  on `sys.path` and lets `zipimport` load it. Switching versions removes `yt_dlp*` from
  `sys.modules` first. If anything fails (missing object, digest mismatch, import error),
  the request falls back to the bundled copy and says so in `meta.ytdlp.fallback_reason`.
- **Pointers** (KV `doesitarm-youtube-state`): `pointer:active` names the version serving
  traffic, `pointer:last_good` the rollback target, and `wheel:<version>` the digest and
  R2 key of each stored wheel. Runs are stored in `run:latest`, `run:index` (last 20)
  and R2 `runs/<timestamp>.json`.
- **Daily job** (cron `17 9 * * *` UTC, `scheduled()` → `run_daily`):
  1. Read PyPI's JSON for yt-dlp and pick the newest stable `py3-none-any` wheel
     (`channel=nightly` picks the newest dev build instead).
  2. Download it, check PyPI's SHA-256 and store it in R2 (`doesitarm-youtube-wheels`).
  3. Run the canary suite for the active version and for the candidate. Each suite
     runs as a separate invocation through the `SELF` service binding, so each gets its
     own CPU and subrequest budget. If the active version fails, also run last-good.
  4. Decide (`canary.decide`): promote a candidate that passes all cases; roll back to
     last-good if active fails for yt-dlp reasons (`upstream_broke`, `contract`) while
     last-good passes; otherwise hold. If failures are only `youtube_blocked` or
     `network`, versions stay unchanged. Only a version that just passed becomes
     last-good.
- **Canary suite** (`src/canary.py`): 3 playlists (first 3 IDs must match, in order)
  and 3 videos (title substring, description at least 80% of the expected length,
  timestamp count, at least half the expected tags). Expected values come from native
  CPython yt-dlp 2026.11.23 on 2026-11-27. Failures are classed `youtube_blocked`
  (sign-in or bot check, 429/403, CAPTCHA), `network` (timeouts, transport), `contract`
  (a field is missing or short) or `upstream_broke` (anything else, including a wheel
  that fails to load).

## Deploy

```sh
cd workers/youtube-api
./scripts/vendor.sh                 # pinned, digest-checked wheels -> python_modules/
python3 -I tests/test_units.py      # CPython unit tests (timestamps, IDs, transport, decisions)
npx wrangler deploy
npx wrangler secret put CANARY_KEY  # once
```

Resources: KV `doesitarm-youtube-state` (`cf44dc02a5e4472bb95fec0f0cf10080`), R2
`doesitarm-youtube-wheels`, and the service binding to itself. `limits.cpu_ms` is
120000 (Workers Paid). To change the bundled fallback, update both wheel lines in
`scripts/vendor.sh` and redeploy. Routine version changes need no redeploy.

## What works and what doesn't (measured 2026-11-27 on hosted Cloudflare)

Works:

- **Playlists from Cloudflare egress**: all 3 canary playlists, every run. The 58-item
  benchmarks playlist (`limit=60`) took 3 requests (page plus 2 continuations), 2.0 s
  wall and 1.2 s CPU on a warm isolate.
- **Videos, once the player clients were changed**: with the `tv_simply,web_embedded`
  clients, full metadata (description, keywords, duration) came back 5/5 for a video
  that failed with the default. Warm requests use 0.2 to 0.8 s CPU and 1.1 to 2.9 s wall.
  A KV cache hit is about 0.1 s.
- **Runtime wheel loading from R2** (zipimport) works on hosted Workers. The stable
  2026.11.23 wheel and the nightly 2026.11.24.232653.dev0 wheel both loaded from R2,
  reported the right `__version__` and passed all 6 canaries.
- **Daily job**: stored the wheel, qualified it and promoted it (bundled → R2 wheel). A
  nightly dry run qualified without promoting. The Cron Trigger itself fired on hosted
  Workers (tested with a temporary `*/3` schedule: 85 ms CPU for the orchestrator, 4.8 s
  CPU for the canary invocation, action `hold`). With the active pointer deliberately given
  a bad digest, live requests fell back to bundled and the job rolled back to
  last-good.

Doesn't, or needs watching:

- **YouTube challenges Cloudflare egress.** On most requests the Watch page
  (`/watch?v=`) answers 302 to `google.com/sorry` (the unusual-traffic CAPTCHA). yt-dlp's
  default `visionos` Player response then says "Sign in to confirm you're not a bot".
  yt-dlp falls back to `/youtubei/v1/next` data, which keeps title and usually the full
  description and timestamps, but loses keywords and duration, and one video's
  description dropped from 638 to 497 characters. In 12 default-client samples across 6
  videos, 10 Watch pages were redirected. The `tv_simply` client still returned full
  data when the Watch page was redirected. This depends on YouTube's current treatment
  of Cloudflare IPs and can change at any time. The canary will then fail as
  `youtube_blocked` and versions are left alone.
- **Cold starts are CPU-heavy.** A fresh isolate's first extraction costs about 3 to
  4 s CPU with the bundled copy and about 7 s when importing from an R2 wheel, because
  zipimport compiles source with no cached bytecode. A full canary suite costs 3 to 11 s
  CPU. This needs Workers Paid. The Free plan's 10 ms limit cannot run it.
- **Startup time** is reported as 0.5 to 1.4 s at deploy (the limit is 1 s for global
  scope). Nothing heavy runs at module scope. Watch this if code grows.
- **Memory** is not reported per request. No out-of-memory failures were seen, but
  loading a second yt-dlp version in one isolate keeps some garbage until GC.
- **Not handled**: EJS signature/n-challenge solving (only needed for media URLs),
  PO tokens, media downloads, and non-YouTube extractors. Brotli is decoded by the
  Workers runtime before Python sees the body. Responses reached Python with no
  `Content-Encoding` header and parsed as text. gzip still encoded is decoded in Python
  (unit-tested).
- KV is eventually consistent, so a pointer change can take up to a minute to reach
  every location.

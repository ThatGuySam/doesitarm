# Security: doesitarm-youtube

The threat: yt-dlp updates itself daily from PyPI, so a compromised or malicious yt-dlp
release would run on our infrastructure without a human looking at it first. Audits on
2026-11-27 (notes-search `docs/research/yt-dlp-wasm-worker-2026-11-27/security/`) showed
that the single-Worker version let such a release read the admin key, rewrite the version
pointers, promote itself and reach any host. This design removes those paths.

## What enforces what

| Control | Enforced by |
| --- | --- |
| yt-dlp code has no bindings, secrets or storage | **Platform.** It runs in a Dynamic Worker whose `env` is three strings (wheel version, digest, label). The host Worker's only binding is the Worker Loader. |
| yt-dlp code reaches only YouTube | **Platform.** `globalOutbound` routes every `fetch()` and `connect()` from the sandbox through `YouTubeGateway` (https, port 443, four youtube.com hosts; sockets refused). `js.fetch` cannot bypass it. |
| Versions never share an isolate | **Platform.** One Dynamic Worker ID per wheel digest and code hash. |
| Only the updater writes pointers, wheels, runs, events, snapshot | **Platform.** Only `doesitarm-youtube-updater` has the pointer KV namespace and the R2 bucket. The API has only its cache KV. |
| Admin key cannot leak through yt-dlp | **Platform.** `UPDATER_KEY` exists only in the updater, which never imports yt-dlp. |
| Only the cron promotes | Code (updater). HTTP admin routes can dry-run, stage, debug and roll back to bundled, never promote. |
| Only attested yt-dlp releases are imported | Code (`provenance.py`): PEP 740 attestation for the exact wheel digest from GitHub `yt-dlp/yt-dlp` `release.yml`, verified against pinned Sigstore keys (Fulcio intermediate, Rekor), including the transparency-log entry. |
| Release cooldown, stable only, no downgrades | Code (`release.pick_release`): stable, at least 3 days old, strictly newer. |
| Static wheel checks before storage or import | Code (`release.check_wheel`). |
| Bundled copy is the permanent rollback | Code (`canary.decide`): rollback goes only to bundled; no wheel is ever a rollback target. |
| Extractor output cannot inject fields | Code (`schema.py`, run by the API and updater): known fields, types and bounds only; URLs and timestamps rebuilt. |
| Cost amplification | Platform rate-limit bindings on cache misses (per IP and total), 60 s failure cache, one cache key per playlist, Dynamic Worker CPU and subrequest limits. |
| Public surface | `/health` returns version and status only; the API accepts only `id` and `limit`; no `/internal` or `/admin` on the API. Updater internal routes answer only the `updater.internal` host, which public requests cannot carry. |

## Tested

- A harmless probe wheel (`tests/malicious/make_probe_wheel.py`) imported in the hosted
  sandbox saw only `WHEEL_SHA256`, `WHEEL_SOURCE`, `WHEEL_VERSION` in `env`; its request
  to `example.com` was answered by the gateway with 403 and reported as `egress_blocked`;
  the job fell back to the bundled copy.
- Unit tests reject tampered attestations (signature, certificate, statement, publisher,
  signed entry timestamp, logged time, inclusion proof) and bad wheels (`.pth`, native
  files, paths outside the package, version mismatch, size change).

## Residual risks

- A malicious yt-dlp release that passes attestation (that is, one built by yt-dlp's own
  release workflow, for example after a maintainer or CI compromise) and survives the
  3-day cooldown could return false metadata. Schema validation limits its shape, not its
  truth; the snapshot and the API would carry it until rolled back. It could also send
  requests to YouTube from Cloudflare IPs. It could not read secrets, write storage,
  promote itself or reach other hosts.
- Within one yt-dlp version's sandbox, a hostile version could tamper with results of
  later jobs in the same isolate. Different versions never share an isolate.
- The attestation check pins the Sigstore public-good Fulcio intermediate and the Rekor
  v1 key. If yt-dlp's attestations move to a new log (for example Rekor v2) or Sigstore
  rotates keys, verification fails closed: no promotions until `provenance.py` is
  updated. Check `candidate_rejected` events.
- The API and the snapshot carry third-party text (titles, descriptions). Consumers must
  render it as text, not HTML.
- Workers Logs (observability) are enabled. Admin requests carry `x-admin-key`; check
  whether request headers are retained in Workers Logs and rotate the key if in doubt.
- The rate-limit bindings are approximate and per location; a distributed client can
  still cause some cache misses.
- No email or push alerts: events are recorded in R2 and counted in `/admin/status`.

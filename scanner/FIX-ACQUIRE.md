# Acquisition failures

This report uses the 2026-11-24 scan ledger as the historical record. The ledger keeps the original URL, available HTTP evidence and byte log, source run, scanner revision, profile, budgets, target, and replay command for each attempt. Read `~/Code/doesitarm-data/scan-ledger/attempts.jsonl` by `ledger_id`. The matching `latest.jsonl` is the last attempt by original URL. `scanner-ledger:scanner/LEDGER.md` explains how to read and replay the records.

[Acquisition attempt records](results/acquire/ledger-acquisition.jsonl) preserves all 285 matching ledger rows for 160 app tokens or names and 168 distinct URLs as of the handoff. It includes prior failed tiers even when a later attempt succeeded. It includes HTTP rejection classes, transfer and source errors, range rejection, timeouts, HTML responses, size caps, and robots decisions. Timeouts retain their original stage and error because some were scan deadlines. A record may omit fields the original run did not capture.

```sh
jq -c 'select(.token == "dropzone" or .token == "jabra-direct")' results/acquire/ledger-acquisition.jsonl
jq -r 'select(.failure_class == "transport_error") | .repro' results/acquire/ledger-acquisition.jsonl
```

| Case | Historical evidence and status |
| --- | --- |
| GitHub releases and Sparkle | 56 latest URLs have `robots_disallowed`. 42 originate at GitHub (32 GitHub connector assets, 8 Sparkle appcasts, 2 Sparkle enclosures). The other 14 are publisher origins. |
| Dropzone 4 | Replay attempt `2cd8a1b3d621895df19a76fd9a520b1d65b03a9a6288be554a3b6c7759fb8be7` saw a 67-byte representation followed by a different total for bytes 0–3. |
| BetterTouchTool | Attempt `6036e71620d955803390312cdbc24cb3978a4a4f2340a6b23f02cbe9e076c024` hit a body read error on a 4 MiB range within the 64 MiB tier. |
| Jabra Direct | The full-file run in `results/edge/followup/run.json` timed out at 159,383,552 of 270,448,755 bytes. The range run found the nested installer and hit its deadline. |
| Warp | Attempts `ff05792ced2b31fc0590fc0c617148f837f60203386e5679d634b08028ee5f22` and `dc3dc689cb30baaced123335a25e170719d7ab52c1cd16a080d78bc90f2a75ec` got 404 for two successive pinned Homebrew builds. |
| SEGGER J-Link | Attempt `89268e29a0d0c0c24f88736789a08d91dbeece212027e4e0db518c9b9cb5889a` observed a 27,647-byte HTML landing page for J-Link 9.96a. The publisher requires license and export-control attestations. |

## GitHub release downloads

Pinned releases now resolve through the tag API and select the uploaded asset by exact decoded filename. The original URL remains the identity in the result. Sparkle feeds published as release assets use the binary endpoint for the appcast, and enclosures use it for byte-range scans. Metadata requests retain conditional ETag caching and rate-limit backoff. With a configured token, repository visibility is checked before discovery. The CDN receives no API token. [Release API](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name) · [Binary asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset) · [GitHub API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

Before the fix, the pinned asset fixture resolved no API URL and the appcast fixture returned `robots_disallowed`. Both pass via `cargo test --offline --locked -j2 -p source-tools`.

The first live rerun used `sources run --connector github-releases --scan-ranges --max-tier 8`. wBlock 3.2.3 returned HTTP 206 at the release CDN with a total size of 38,560,397 bytes. The scan read 2,914,380 bytes and verified arm64 and x86_64. The remaining GitHub-hosted cases are running against their pinned URLs.

## Worker origin handling

Three offline HTTP fixtures cover the Worker egress path. With no explicit scanner User-Agent the header-gated origin returned 403, reported as 502 by the Worker. A post-probe redirect previously returned 200 with scan results from the replacement path. A two-URL loop previously used all seven origin requests. The Worker now identifies itself, pins the URL that served the first 206, and detects repeated URLs before requesting them again. A/AAAA lookups run sequentially through the same resolver. The Worker still cancels HTTP 200 bodies and honors its six-redirect and 36-subrequest limits. `npm --prefix web test` passed 39 tests. These fixtures use synthetic origins and the Worker was exercised in Node.

A separate range fixture pins a strong ETag, then returns a weak ETag on the next 206. The previous Worker returned 200. The range reader now rejects the advertised validator change with 502. A missing response ETag can still be accepted when the conditional request gives no evidence of a change.

## Replaying pinned GitHub assets

Historical source tasks with a pinned artifact previously went straight to the web URL. The offline replay failed with `fixture_miss` on that URL. It now uses the same connector resolver as a fresh run. A second offline CLI replay found that a relative appcast enclosure resolved against the asset API path and also failed with `fixture_miss`. The corrected replay records the publisher's sibling release URL and validates HTTP 206 through the asset API.

## Source-tools transfer and access fixtures

| Fixture | Before | After |
| --- | --- | --- |
| BetterTouchTool-style truncated 206 | The partial response ended in `unable to read HTTP response body`. | The reader requests only the missing bytes. It requires the original strong ETag, total length, final URL and exact interval on every resumed response. The test rejects a changed ETag. |
| SEGGER J-Link 9.96a GET | The HTTP 200 HTML response became a generic `html_landing_page`. | The publisher's macOS package endpoint is classified `needs_attestation`. An eligible user can obtain the package through SEGGER's download flow and scan the saved file with `scan-cli scan FILE --profile local`. [SEGGER downloads and eligibility](https://www.segger.com/downloads/jlink/) |
| Content-Disposition on an extensionless URL | The probe omitted the filename. | The probe retains a safe basename. The fixtures cover UTF-8 `filename*` precedence, path stripping, and a quoted filename containing a semicolon. The name is advisory and byte inspection still determines the format. [RFC 6266](https://www.rfc-editor.org/rfc/rfc6266.html#section-4.3) |

The BetterTouchTool replay uses a generated four-byte window. The historical source-tools attempt captured a dropped 4,194,304-byte response for bytes 29,649,623–33,843,926 at the 64 MiB scan tier. The fixture models the same partial-body failure and counts every byte actually received.

## Native HTTP fixtures

| Fixture | Before | After |
| --- | --- | --- |
| Dropzone text probe | The one-byte response advertised 67 bytes. The following ZIP range failed with `representation size changed`. | A text/plain probe in a native remote scan is corroborated with a fresh four-byte range before using the size. Both probes count toward the budget. The fixture reuses the recorded response shape and a generated 2,255-byte ZIP. |
| Interrupted whole response | The scan stopped with `Peer disconnected`. | With streaming enabled, a partially received response can resume at the next missing byte. A strong ETag and a matching length, final URL and exact 206 are required. The spool remains bounded by the scan budget. |
| Changed whole-response fallback | A replacement response was allowed to supply the scanner result after range discovery. | The fallback rejects a different final URL or an explicitly changed length or validator before consuming its body. |
| Transient HTTP 500 | The first 500 aborted the scan. | The native remote scan retries that same range once after a delay when the response supplies no Retry-After and the scan deadline allows it. |

`cargo test --workspace --offline --locked -j2` passed 77 tests, including the local and Worker profile checks. The new HTTP wire fixtures use in-memory responses.

## GitHub aliases and repository transfers

All 32 GitHub connector retries received HTTP 206. Thirty verified architecture and metadata. `mlx-serve` reached the 8 MiB byte limit and Mole reached a missing plist. Both cleared acquisition.

Two Sparkle reruns exposed additional cases. Ardia's old owner path redirected the binary request to a numeric GitHub API path, which previously lost the binary Accept header and supplied ranged JSON. Ping Island's appcast points to a `releases/latest/download` alias. Four offline tests reproduced the wrong endpoint, missed alias, unrecognized numeric route, and JSON mistaken for archive bytes. The resolver now honors the canonical asset URL returned by the release API, recognizes the numeric route, and resolves a latest alias by the exact filename in the current release. GitHub API JSON is classified as metadata even if it carries HTTP 206.

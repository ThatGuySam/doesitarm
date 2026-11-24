# Homebrew scanner scoreboard

35/100 artifacts checked. 33 app results and 0 standalone executable results verified. Run started 2026-11-24T07:29:10+00:00.

Checked artifacts cover 35 of 100 casks.

Across all attempts, the CLI reported 1,421,485,539 bytes and 2,446 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| dmg | 12 | 11 | http_404 1, verified 11 |
| pkg | 6 | 6 | verified 6 |
| tar.gz | 6 | 5 | plist_not_found 1, verified 5 |
| zip | 11 | 11 | verified 11 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 33 |
| http_404 | 1 |
| plist_not_found | 1 |

## Architecture hints

- agrees 16
- unavailable 1

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| cursor-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |

# Homebrew scanner scoreboard

37/100 artifacts checked. 28 app results and 1 standalone executable results verified. Run started 2026-11-24T07:35:42+00:00.

Checked artifacts cover 37 of 100 casks.

Across all attempts, the CLI reported 836,570,617 bytes and 861 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| dmg | 6 | 5 | http_404 1, verified 5 |
| pkg | 6 | 6 | verified 6 |
| tar.bz2 | 2 | 0 | other 2 |
| tar.gz | 7 | 6 | script_executable 1, verified 5, verified_executable 1 |
| tar.xz | 4 | 0 | other 4 |
| zip | 12 | 12 | verified 12 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 28 |
| other | 6 |
| http_404 | 1 |
| script_executable | 1 |
| verified_executable | 1 |

## Architecture hints

- agrees 14
- unavailable 4

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| timing | tar.xz | other | invalid data: tar header checksum |
| little-snitch | tar.xz | other | invalid data: tar header checksum |
| google-chrome | tar.xz | other | invalid data: tar header checksum |
| firefox | tar.xz | other | invalid data: tar header checksum |
| vlc | tar.bz2 | other | invalid data: tar header checksum |
| slack | tar.bz2 | other | invalid data: tar header checksum |
| cursor-cli | tar.gz | script_executable | unsupported: declared executable is a script |

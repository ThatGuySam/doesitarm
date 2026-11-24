# Homebrew scanner scoreboard

100/100 artifacts checked. 77 app results and 8 standalone executable results verified. Run started 2026-11-24T07:41:49+00:00.

Checked artifacts cover 100 of 100 casks.

Across all attempts, the CLI reported 3,282,958,917 bytes and 2,574 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 30 | 27 | budget_hit 1, http_404 1, script_executable 1, verified 27 |
| pkg | 20 | 14 | budget_hit 2, html_response 1, other_source_error 2, plist_not_found 1, verified 14 |
| tar.bz2 | 1 | 1 | verified 1 |
| tar.gz | 17 | 14 | budget_hit 1, executable_not_found 1, script_executable 1, verified 6, verified_executable 8 |
| tar.xz | 3 | 2 | other 1, verified 2 |
| zip | 28 | 27 | multi_executable 1, verified 27 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 77 |
| verified_executable | 8 |
| budget_hit | 4 |
| script_executable | 2 |
| other_source_error | 2 |
| http_404 | 1 |
| plist_not_found | 1 |
| html_response | 1 |
| executable_not_found | 1 |
| unsupported_container | 1 |
| multi_executable | 1 |
| other | 1 |

## Architecture hints

- agrees 34
- unavailable 7

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| cursor-cli | tar.gz | script_executable | unsupported: declared executable is a script |
| anka-build-cloud-registry | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| segger-jlink | pkg | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html; charset=UTF-8 |
| browserstacklocal | tar.gz | executable_not_found | not found: declared executable in sequential archive |
| network-weather | pkg | other_source_error | source: range 2187713-3236288: HTTP 500 Internal Server Error (expected 206) |
| soothe2 | pkg | budget_hit | byte budget reached |
| aqua-data-studio | tar.gz | budget_hit | byte budget reached |
| konica-minolta-bizhub-c759-c658-c368-c287-c3851-driver | pkg | other_source_error | source: timeout: global; HTTP 200 body, application/octet-stream |
| suuntodm5 | dmg | script_executable | unsupported: declared executable is a script |
| qt-design-studio | 7z | unsupported_container | unsupported: unrecognized file format |
| fabfilter-pro-ds | dmg | budget_hit | byte budget reached |
| flutter | zip | multi_executable | Individual targets {'flutter/bin/dart': 'script_executable', 'flutter/bin/flutter': 'script_executable'}. All must verify with one shared strong ETag. |
| backuploupe | tar.xz | other | invalid data: XZ stream |
| insta360-link-controller | pkg | budget_hit | byte budget reached |

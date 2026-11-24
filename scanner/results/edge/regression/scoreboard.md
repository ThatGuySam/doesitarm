# Homebrew scanner scoreboard

100/100 artifacts checked. 81 apps, 8 standalone executables, and 1 installed products verified. Run started 2026-11-24T19:03:40+00:00.

Checked artifacts cover 100 of 100 casks.

Across all attempts, the CLI reported 3,531,500,436 bytes and 6,237 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 1 | verified 1 |
| dmg | 30 | 28 | http_404 1, script_executable 1, verified 27, verified_plugin 1 |
| pkg | 20 | 15 | budget_hit 2, html_response 1, other_source_error 1, plist_not_found 1, verified 15 |
| tar.bz2 | 1 | 1 | verified 1 |
| tar.gz | 17 | 15 | budget_hit 1, script_executable 1, verified 7, verified_executable 8 |
| tar.xz | 3 | 3 | verified 3 |
| zip | 28 | 27 | multi_executable 1, verified 27 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 81 |
| verified_executable | 8 |
| budget_hit | 3 |
| script_executable | 2 |
| http_404 | 1 |
| plist_not_found | 1 |
| html_response | 1 |
| other_source_error | 1 |
| verified_plugin | 1 |
| multi_executable | 1 |

## Architecture hints

- agrees 35
- disagrees 1
- unavailable 5

| Cask | Hint | Expected | Observed |
| --- | --- | --- | --- |
| qt-design-studio | URL path | x86_64 | arm64 |

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| cursor-cli | tar.gz | script_executable | unsupported: declared executable is a script |
| anka-build-cloud-registry | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| segger-jlink | pkg | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html; charset=UTF-8 |
| soothe2 | pkg | budget_hit | byte budget reached |
| aqua-data-studio | tar.gz | budget_hit | byte budget reached |
| konica-minolta-bizhub-c759-c658-c368-c287-c3851-driver | pkg | other_source_error | source: timeout: global; HTTP 200 body, application/octet-stream |
| suuntodm5 | dmg | script_executable | unsupported: declared executable is a script |
| flutter | zip | multi_executable | Individual targets {'flutter/bin/dart': 'script_executable', 'flutter/bin/flutter': 'script_executable'}. All must verify with one shared strong ETag. |
| insta360-link-controller | pkg | budget_hit | byte budget reached |

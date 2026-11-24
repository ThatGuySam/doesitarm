# Homebrew scanner scoreboard

100/100 artifacts checked. 74 verified. Run started 2026-11-24T07:07:08+00:00.

Across all attempts, the CLI reported 3,696,040,879 bytes and 5,186 reads. 1 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 30 | 27 | http_404 1, other 1, plist_not_found 1, verified 27 |
| pkg | 20 | 14 | budget_hit 1, html_response 1, other_source_error 1, plist_not_found 2, timeout 1, verified 14 |
| tar.gz | 17 | 6 | budget_hit 1, plist_not_found 9, unsupported_container 1, verified 6 |
| tar.xz | 3 | 0 | unsupported_container 3 |
| tbz | 1 | 0 | unsupported_container 1 |
| zip | 28 | 27 | plist_not_found 1, verified 27 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 74 |
| plist_not_found | 13 |
| unsupported_container | 6 |
| budget_hit | 2 |
| http_404 | 1 |
| timeout | 1 |
| html_response | 1 |
| other_source_error | 1 |
| other | 1 |

## Architecture hints

- agrees 25
- unavailable 15

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| mullvad-vpn | pkg | timeout | 60s per-attempt deadline |
| cursor-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| devin-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| mailplane | tbz | unsupported_container | unsupported: unrecognized file format |
| anka-build-cloud-registry | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| segger-jlink | pkg | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html; charset=UTF-8 |
| warp-agent-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive; HTTP 200 body, application/gzip |
| komet | tar.xz | unsupported_container | unsupported: unrecognized file format |
| browserstacklocal | tar.gz | unsupported_container | unsupported: CFBundleExecutable is not a single filename |
| tangleguard-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| confluent-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| spotify-soloist | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| soothe2 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| aqua-data-studio | tar.gz | budget_hit | byte budget reached |
| atomcode | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| konica-minolta-bizhub-c759-c658-c368-c287-c3851-driver | pkg | other_source_error | source: timeout: global; HTTP 200 body, application/octet-stream |
| suuntodm5 | dmg | other | invalid data: executable is not Mach-O |
| vivaldi@snapshot | tar.xz | unsupported_container | unsupported: unrecognized file format |
| qt-design-studio | 7z | unsupported_container | unsupported: unrecognized file format |
| fabfilter-pro-ds | dmg | plist_not_found | not found: app at the APFS volume root |
| flutter | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| expose | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| vercel | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| backuploupe | tar.xz | unsupported_container | unsupported: unrecognized file format |
| insta360-link-controller | pkg | budget_hit | byte budget reached |

# Homebrew scanner scoreboard

100/100 artifacts checked. 54 verified. Run started 2026-11-24T06:59:50+00:00.

Across all attempts, the CLI reported 336,678,403 bytes and 1,159 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 30 | 26 | http_404 1, other 1, other_source_error 1, plist_not_found 1, verified 26 |
| pkg | 20 | 2 | budget_hit 15, host_200_to_range 2, plist_not_found 1, verified 2 |
| tar.gz | 17 | 4 | budget_hit 7, host_200_to_range 3, plist_not_found 2, unsupported_container 1, verified 4 |
| tar.xz | 3 | 0 | unsupported_container 3 |
| tbz | 1 | 0 | unsupported_container 1 |
| zip | 28 | 22 | budget_hit 4, host_200_to_range 1, plist_not_found 1, verified 22 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 54 |
| budget_hit | 26 |
| host_200_to_range | 6 |
| unsupported_container | 6 |
| plist_not_found | 5 |
| http_404 | 1 |
| other_source_error | 1 |
| other | 1 |

## Architecture hints

- agrees 20
- unavailable 20

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| telegram | zip | budget_hit | byte budget reached |
| macwhisper | zip | budget_hit | byte budget reached |
| iterm2 | zip | budget_hit | byte budget reached |
| warp | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| kunkun | tar.gz | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| zoom | pkg | budget_hit | byte budget reached |
| microsoft-teams | pkg | budget_hit | byte budget reached |
| teamviewer | pkg | budget_hit | byte budget reached |
| mullvad-vpn | pkg | budget_hit | byte budget reached |
| cursor-cli | tar.gz | budget_hit | byte budget reached |
| sketch@beta | zip | budget_hit | byte budget reached |
| unifi-identity-endpoint | pkg | budget_hit | byte budget reached |
| devin-cli | tar.gz | budget_hit | byte budget reached |
| mailplane | tbz | unsupported_container | unsupported: unrecognized file format |
| anka-build-cloud-registry | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| segger-jlink | pkg | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| warp-agent-cli | tar.gz | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| komet | tar.xz | unsupported_container | unsupported: unrecognized file format |
| browserstacklocal | tar.gz | unsupported_container | unsupported: CFBundleExecutable is not a single filename |
| tangleguard-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| enpass | pkg | budget_hit | byte budget reached |
| network-weather | pkg | budget_hit | byte budget reached |
| mumuplayer | tar.gz | budget_hit | byte budget reached |
| confluent-cli | tar.gz | budget_hit | byte budget reached |
| senadevicemanager | pkg | budget_hit | byte budget reached |
| spotify-soloist | tar.gz | budget_hit | byte budget reached |
| soothe2 | pkg | budget_hit | byte budget reached |
| aqua-data-studio | tar.gz | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| atomcode | tar.gz | budget_hit | byte budget reached |
| keysmith | dmg | other_source_error | source: configured for https only: http://www.keysmith.app/versions/Keysmith-1.18.7.dmg |
| konica-minolta-bizhub-c759-c658-c368-c287-c3851-driver | pkg | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| eagle | pkg | budget_hit | byte budget reached |
| suuntodm5 | dmg | other | invalid data: executable is not Mach-O |
| vivaldi@snapshot | tar.xz | unsupported_container | unsupported: unrecognized file format |
| scrub-utility | zip | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| qt-design-studio | 7z | unsupported_container | unsupported: unrecognized file format |
| fabfilter-pro-ds | dmg | plist_not_found | not found: app at the APFS volume root |
| flutter | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| expose | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| vercel | tar.gz | budget_hit | byte budget reached |
| backuploupe | tar.xz | unsupported_container | unsupported: unrecognized file format |
| mipony | pkg | budget_hit | byte budget reached |
| insta360-link-controller | pkg | budget_hit | byte budget reached |
| displaylink | pkg | budget_hit | byte budget reached |
| steelseries-gg | pkg | budget_hit | byte budget reached |
| tnas-pc | pkg | budget_hit | byte budget reached |

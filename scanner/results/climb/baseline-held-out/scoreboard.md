# Homebrew scanner scoreboard

100/100 artifacts checked. 42 verified. Run started 2026-11-24T07:02:51+00:00.

Across all attempts, the CLI reported 342,773,845 bytes and 1,163 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 28 | 23 | metadata_missing 1, other 1, plist_not_found 2, unsupported_container 1, verified 23 |
| pkg | 19 | 1 | budget_hit 15, http_403 1, plist_not_found 1, unsupported_container 1, verified 1 |
| tar.bz2 | 1 | 0 | unsupported_container 1 |
| tar.gz | 18 | 0 | budget_hit 14, host_200_to_range 1, plist_not_found 3 |
| tar.xz | 5 | 0 | unsupported_container 5 |
| tbz | 2 | 0 | unsupported_container 2 |
| txz | 1 | 0 | unsupported_container 1 |
| zip | 25 | 18 | budget_hit 2, host_200_to_range 1, plist_not_found 4, verified 18 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 42 |
| budget_hit | 31 |
| unsupported_container | 12 |
| plist_not_found | 10 |
| host_200_to_range | 2 |
| other | 1 |
| http_403 | 1 |
| metadata_missing | 1 |

## Architecture hints

- agrees 18
- unavailable 21

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| launchcontrol | tar.xz | unsupported_container | unsupported: unrecognized file format |
| prezi-video | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| prolific-pl2303 | 7z | unsupported_container | unsupported: unrecognized file format |
| libifd-cyberjack | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| bricklink-partdesigner | pkg | budget_hit | byte budget reached |
| mixed-in-key-live | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| dotnet-sdk@preview | pkg | budget_hit | byte budget reached |
| hackolade | pkg | budget_hit | byte budget reached |
| mitmproxy | tar.gz | budget_hit | byte budget reached |
| geekbench | zip | budget_hit | byte budget reached |
| liquibase-community | tar.gz | budget_hit | byte budget reached |
| copilot-cli | tar.gz | budget_hit | byte budget reached |
| liquibase-secure | tar.gz | budget_hit | byte budget reached |
| lagrange | tbz | unsupported_container | unsupported: unrecognized file format |
| arm-performance-libraries | tar.gz | budget_hit | byte budget reached |
| ammonite | tar.xz | unsupported_container | unsupported: unrecognized file format |
| perforce | tar.gz | budget_hit | byte budget reached |
| whatsize | pkg | budget_hit | byte budget reached |
| butterkit | zip | budget_hit | byte budget reached |
| btp | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| mailmate@beta | tbz | unsupported_container | unsupported: unrecognized file format |
| codexmonitor | tar.gz | budget_hit | byte budget reached |
| mini-vmac | tar.gz | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| tiptoi-manager | pkg | budget_hit | byte budget reached |
| dintch | zip | host_200_to_range | source: range 0-0: HTTP 200 OK (expected 206) |
| fidelity-trader+ | pkg | budget_hit | byte budget reached |
| fabfilter-timeless | dmg | plist_not_found | not found: app at the APFS volume root |
| terminal-browser | tar.gz | budget_hit | byte budget reached |
| hancom-word | pkg | unsupported_container | unsupported: unrecognized file format |
| slack-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| box-drive | pkg | budget_hit | byte budget reached |
| ti-smartview-ce-for-the-ti-84-plus-family | dmg | other | scan limit: APFS checkpoint ring exceeds 128 blocks |
| yubihsm2-sdk | pkg | budget_hit | byte budget reached |
| corretto@17 | pkg | budget_hit | byte budget reached |
| 1password-cli@beta | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| vivaldi | tar.xz | unsupported_container | unsupported: unrecognized file format |
| jumpshare | tar.bz2 | unsupported_container | unsupported: unrecognized file format |
| cave-story | dmg | unsupported_container | unsupported: unrecognized file format |
| touchswitcher | txz | unsupported_container | unsupported: unrecognized file format |
| jabra-direct | dmg | plist_not_found | not found: app at the APFS volume root |
| send-to-kindle | pkg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| gcloud-cli | tar.gz | budget_hit | byte budget reached |
| jdk-mission-control | tar.gz | budget_hit | byte budget reached |
| tailscale-app | pkg | budget_hit | byte budget reached |
| orka | pkg | budget_hit | byte budget reached |
| caldigit-docking-utility | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| carbide-create | dmg | metadata_missing | app registration ['Carbide Create.app'], scanner bundle Carbide Create.app |
| ollama-binary | tar.gz | budget_hit | byte budget reached |
| notion-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| bluestacks | pkg | budget_hit | byte budget reached |
| serviio | tar.gz | budget_hit | byte budget reached |
| maru-jan | pkg | budget_hit | byte budget reached |
| imageoptim | tar.xz | unsupported_container | unsupported: unrecognized file format |
| jamie | tar.gz | budget_hit | byte budget reached |
| liclipse | tar.gz | budget_hit | byte budget reached |
| xiv-on-mac | tar.xz | unsupported_container | unsupported: unrecognized file format |
| swi-prolog-app | pkg | budget_hit | byte budget reached |
| filebot | pkg | budget_hit | byte budget reached |

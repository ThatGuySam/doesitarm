# Homebrew scanner scoreboard

100/100 artifacts checked. 56 verified. Run started 2026-11-24T07:17:30+00:00.

Checked artifacts cover 100 of 100 casks.

Across all attempts, the CLI reported 3,196,702,270 bytes and 4,301 reads. 3 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 28 | 23 | metadata_missing 1, other 1, plist_not_found 2, unsupported_container 1, verified 23 |
| pkg | 19 | 8 | budget_hit 1, http_403 1, other_source_error 1, plist_not_found 6, timeout 1, unsupported_container 1, verified 8 |
| tar.bz2 | 1 | 0 | unsupported_container 1 |
| tar.gz | 18 | 4 | metadata_missing 1, other 1, other_source_error 1, plist_not_found 9, timeout 2, verified 4 |
| tar.xz | 5 | 0 | unsupported_container 5 |
| tbz | 2 | 0 | unsupported_container 2 |
| txz | 1 | 0 | unsupported_container 1 |
| zip | 25 | 21 | plist_not_found 4, verified 21 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 56 |
| plist_not_found | 21 |
| unsupported_container | 12 |
| timeout | 3 |
| other | 2 |
| other_source_error | 2 |
| metadata_missing | 2 |
| http_403 | 1 |
| budget_hit | 1 |

## Architecture hints

- agrees 23
- unavailable 16

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| launchcontrol | tar.xz | unsupported_container | unsupported: unrecognized file format |
| prezi-video | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| prolific-pl2303 | 7z | unsupported_container | unsupported: unrecognized file format |
| libifd-cyberjack | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| mixed-in-key-live | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| dotnet-sdk@preview | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| mitmproxy | tar.gz | other | invalid data: executable is not Mach-O |
| liquibase-community | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| copilot-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| liquibase-secure | tar.gz | other_source_error | source: range 42008576-43057151: HTTP 429 Too Many Requests (expected 206) |
| lagrange | tbz | unsupported_container | unsupported: unrecognized file format |
| arm-performance-libraries | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| ammonite | tar.xz | unsupported_container | unsupported: unrecognized file format |
| perforce | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| btp | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| mailmate@beta | tbz | unsupported_container | unsupported: unrecognized file format |
| mini-vmac | tar.gz | metadata_missing | app registration ['Mini vMac.app'], scanner bundle Mini vMac.app; HTTP 200 body, application/x-gzip |
| tiptoi-manager | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| fidelity-trader+ | pkg | other_source_error | source: range 0-27: representation size changed |
| fabfilter-timeless | dmg | plist_not_found | not found: app at the APFS volume root |
| hancom-word | pkg | unsupported_container | unsupported: unrecognized file format |
| slack-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| ti-smartview-ce-for-the-ti-84-plus-family | dmg | other | scan limit: APFS checkpoint ring exceeds 128 blocks |
| yubihsm2-sdk | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| corretto@17 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| 1password-cli@beta | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| vivaldi | tar.xz | unsupported_container | unsupported: unrecognized file format |
| jumpshare | tar.bz2 | unsupported_container | unsupported: unrecognized file format |
| cave-story | dmg | unsupported_container | unsupported: unrecognized file format |
| touchswitcher | txz | unsupported_container | unsupported: unrecognized file format |
| jabra-direct | dmg | plist_not_found | not found: app at the APFS volume root |
| send-to-kindle | pkg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| gcloud-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| orka | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| caldigit-docking-utility | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| carbide-create | dmg | metadata_missing | app registration ['Carbide Create.app'], scanner bundle Carbide Create.app |
| ollama-binary | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| notion-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| bluestacks | pkg | budget_hit | byte budget reached |
| serviio | tar.gz | timeout | 60s per-attempt deadline |
| maru-jan | pkg | timeout | 60s per-attempt deadline |
| imageoptim | tar.xz | unsupported_container | unsupported: unrecognized file format |
| liclipse | tar.gz | timeout | 60s per-attempt deadline |
| xiv-on-mac | tar.xz | unsupported_container | unsupported: unrecognized file format |

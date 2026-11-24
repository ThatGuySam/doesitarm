# Homebrew scanner scoreboard

100/100 artifacts checked. 65 app results and 8 standalone executable results verified. Run started 2026-11-24T07:49:42+00:00.

Checked artifacts cover 100 of 100 casks.

Across all attempts, the CLI reported 3,266,878,700 bytes and 2,869 reads. 1 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 0 | unsupported_container 1 |
| dmg | 28 | 24 | metadata_missing 1, nested_container 1, other 1, unsupported_container 1, verified 24 |
| pkg | 19 | 9 | budget_hit 1, http_403 1, other_source_error 1, plist_not_found 6, unsupported_container 1, verified 9 |
| tar.bz2 | 3 | 2 | other 1, verified 2 |
| tar.gz | 18 | 11 | metadata_missing 1, plist_not_found 2, script_executable 3, timeout 1, verified 4, verified_executable 7 |
| tar.xz | 6 | 3 | other 3, verified 3 |
| zip | 25 | 24 | nested_container 1, verified 23, verified_executable 1 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 65 |
| plist_not_found | 8 |
| verified_executable | 8 |
| other | 5 |
| unsupported_container | 3 |
| script_executable | 3 |
| nested_container | 2 |
| metadata_missing | 2 |
| other_source_error | 1 |
| http_403 | 1 |
| budget_hit | 1 |
| timeout | 1 |

## Architecture hints

- agrees 33
- unavailable 8

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| launchcontrol | tar.xz | other | invalid data: XZ stream |
| prezi-video | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| prolific-pl2303 | 7z | unsupported_container | unsupported: unrecognized file format |
| libifd-cyberjack | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| dotnet-sdk@preview | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| liquibase-community | tar.gz | script_executable | unsupported: declared executable is a script |
| liquibase-secure | tar.gz | script_executable | unsupported: declared executable is a script |
| arm-performance-libraries | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| ammonite | tar.xz | other | invalid data: XZ stream |
| mailmate@beta | tar.bz2 | other | invalid data: compressed stream ended before requested output |
| mini-vmac | tar.gz | metadata_missing | app registration ['Mini vMac.app'], scanner bundle Mini vMac.app; HTTP 200 body, application/x-gzip |
| tiptoi-manager | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| fidelity-trader+ | pkg | other_source_error | source: range 5583743-6632318: representation size changed |
| fabfilter-timeless | dmg | nested_container | not found: app Info.plist in sequential archive |
| terminal-browser | tar.gz | script_executable | unsupported: declared executable is a script |
| hancom-word | pkg | unsupported_container | unsupported: unrecognized file format |
| ti-smartview-ce-for-the-ti-84-plus-family | dmg | other | scan limit: APFS checkpoint ring exceeds 128 blocks |
| yubihsm2-sdk | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| corretto@17 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| cave-story | dmg | unsupported_container | unsupported: unrecognized file format |
| send-to-kindle | pkg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| gcloud-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| orka | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| carbide-create | dmg | metadata_missing | app registration ['Carbide Create.app'], scanner bundle Carbide Create.app |
| bluestacks | pkg | budget_hit | byte budget reached |
| serviio | tar.gz | timeout | 60s per-attempt deadline |
| imageoptim | tar.xz | other | invalid data: XZ stream |

# Homebrew scanner scoreboard

100/100 artifacts checked. 71 apps, 7 standalone executables, and 2 installed products verified. Run started 2026-11-24T19:16:19+00:00.

Checked artifacts cover 100 of 100 casks.

Across all attempts, the CLI reported 4,250,753,579 bytes and 6,352 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 1 | verified 1 |
| dmg | 28 | 25 | budget_hit 1, metadata_missing 1, nested_container 1, verified 24, verified_plugin 1 |
| pkg | 19 | 11 | budget_hit 1, http_403 1, other_source_error 1, plist_not_found 4, unsupported_container 1, verified 10, verified_plugin 1 |
| tar.bz2 | 3 | 3 | verified 3 |
| tar.gz | 18 | 10 | html_response 1, metadata_missing 1, other 1, plist_not_found 2, script_executable 3, verified 4, verified_executable 6 |
| tar.xz | 6 | 6 | verified 6 |
| zip | 25 | 24 | budget_hit 1, verified 23, verified_executable 1 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 71 |
| verified_executable | 7 |
| plist_not_found | 6 |
| budget_hit | 3 |
| script_executable | 3 |
| metadata_missing | 2 |
| verified_plugin | 2 |
| html_response | 1 |
| other_source_error | 1 |
| unsupported_container | 1 |
| nested_container | 1 |
| http_403 | 1 |
| other | 1 |

## Architecture hints

- agrees 33
- unavailable 8

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| prezi-video | zip | budget_hit | byte budget reached |
| libifd-cyberjack | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| dotnet-sdk@preview | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| liquibase-community | tar.gz | script_executable | unsupported: declared executable is a script |
| liquibase-secure | tar.gz | script_executable | unsupported: declared executable is a script |
| arm-performance-libraries | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| btp | tar.gz | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html |
| mini-vmac | tar.gz | metadata_missing | app registration ['Mini vMac.app'], scanner bundle Mini vMac.app; HTTP 200 body, application/x-gzip |
| fidelity-trader+ | pkg | other_source_error | source: range 46478207-50672510: representation size changed |
| terminal-browser | tar.gz | script_executable | unsupported: declared executable is a script |
| hancom-word | pkg | unsupported_container | unsupported: unrecognized file format |
| ti-smartview-ce-for-the-ti-84-plus-family | dmg | budget_hit | byte budget reached |
| yubihsm2-sdk | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| jabra-direct | dmg | nested_container | scan limit: scan deadline reached |
| send-to-kindle | pkg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| gcloud-cli | tar.gz | plist_not_found | not found: app Info.plist in sequential archive |
| orka | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| carbide-create | dmg | metadata_missing | app registration ['Carbide Create.app'], scanner bundle Carbide Create.app |
| bluestacks | pkg | budget_hit | byte budget reached |
| serviio | tar.gz | other | scan limit: scan deadline reached |

# Homebrew scanner scoreboard

84/101 artifacts checked. 10 apps, 0 standalone executables, and 0 installed products verified. Run started 2026-11-24T19:38:12+00:00.

Checked artifacts cover 59 of 70 casks.

Across all attempts, the CLI reported 2,513,022,038 bytes and 1,875 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| dmg | 55 | 4 | executable_not_found 1, http_403 1, http_404 2, metadata_missing 5, nested_container 4, other 1, other_source_error 3, plist_not_found 4, script_executable 29, unsupported_codec 1, verified 4 |
| pkg | 14 | 1 | budget_hit 3, metadata_missing 2, other 2, plist_not_found 6, verified 1 |
| tar.gz | 2 | 0 | http_429 1, plist_not_found 1 |
| tar.xz | 1 | 0 | other 1 |
| tar.zst | 1 | 0 | script_executable 1 |
| unknown | 1 | 0 | html_response 1 |
| zip | 10 | 5 | http_403 1, nested_container 1, other_source_error 1, script_executable 2, verified 5 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| script_executable | 32 |
| plist_not_found | 11 |
| verified | 10 |
| metadata_missing | 7 |
| nested_container | 5 |
| other | 4 |
| other_source_error | 4 |
| budget_hit | 3 |
| http_403 | 2 |
| http_404 | 2 |
| executable_not_found | 1 |
| http_429 | 1 |
| html_response | 1 |
| unsupported_codec | 1 |

## Architecture hints

- agrees 3
- inconclusive 8
- unavailable 61

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| wine-stable | tar.xz | other | scan limit: scan deadline reached |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| dropzone | zip | other_source_error | source: range 0-3: representation size changed |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| starnet2 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| rolisteam | dmg | metadata_missing | app registration ['rolisteam.app'], scanner bundle rolisteam.app |
| open-eid | dmg | other_source_error | source: range 0-3: HTTP 412 Precondition Failed (expected 206) |
| orka3 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| windterm | dmg | metadata_missing | app registration ['WindTerm.app'], scanner bundle WindTerm.app |
| tageditor | dmg | plist_not_found | not found: app or package at the HFS volume root |
| openzfs | pkg | metadata_missing | app registration [], scanner bundle Library/Extensions/zfs.kext |
| opensesame | dmg | script_executable | unsupported: declared executable is a script |
| cardinal | pkg | budget_hit | byte budget reached |
| temurin | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| psi | dmg | plist_not_found | not found: app or package at the HFS volume root |
| go-agent | zip | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| dotnet-sdk@8 | pkg | other | scan limit: scan deadline reached |
| ringcentral-phone | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| db-browser-for-sqlcipher@nightly | dmg | executable_not_found | not found: CFBundleExecutable in Info.plist |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| enclave | pkg | other | scan limit: scan deadline reached |
| cap | tar.gz | http_429 | source: range 12648448-16842751: HTTP 429 Too Many Requests (expected 206) |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| circuitjs1 | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| imagej | zip | script_executable | unsupported: declared executable is a script |
| openzfs | pkg | metadata_missing | app registration [], scanner bundle Library/Extensions/zfs.kext |
| anypointstudio | zip | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| krisp | pkg | plist_not_found | not found: app Info.plist in sequential archive; HTTP 200 body, application/octet-stream |
| dcp-o-matic | unknown | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html; charset=UTF-8 |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| baidunetdisk | dmg | other_source_error | source: io: Network is unreachable (os error 101) |
| rstudio | dmg | unsupported_codec | unsupported: APFS decmpfs-compressed file |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| napari | pkg | budget_hit | byte budget reached |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| chemdoodle | dmg | plist_not_found | not found: app or package at the HFS volume root |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| orka-vm-tools | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| unity-ios-support-for-editor | pkg | budget_hit | byte budget reached |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| osmc | dmg | metadata_missing | app registration ['qt_host_installer.app'], scanner bundle qt_host_installer.app |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| mysql-shell | dmg | nested_container | not found: app Info.plist in sequential archive |
| scidvsmac | dmg | script_executable | unsupported: declared executable is a script |
| wings3d | dmg | script_executable | unsupported: declared executable is a script |
| chronosync | dmg | nested_container | unsupported: multiple nested PKGs in HFS volume |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| segger-embedded-studio | dmg | metadata_missing | app registration [], scanner bundle bin/crashreporter.app |
| netlogo | dmg | plist_not_found | not found: app or package at the HFS volume root |
| codeql-bundle | tar.zst | script_executable | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| write | dmg | other_source_error | source: io: unexpected end of file |
| libndi | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| volt-app | dmg | metadata_missing | app registration ['Volt.app'], scanner bundle Volt.app |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| nvs | tar.gz | plist_not_found | not found: app Info.plist in sequential archive; HTTP 200 body, application/x-gzip |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| display-pilot | zip | nested_container | scan limit: scan deadline reached |
| dingtalk | dmg | nested_container | scan limit: scan deadline reached |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| klayout | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| virtualbox@beta | dmg | nested_container | scan limit: scan deadline reached |
| xampp | dmg | other | invalid data: range outside its container |

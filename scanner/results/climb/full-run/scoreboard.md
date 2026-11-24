# Homebrew scanner scoreboard

676/7,570 artifacts checked. 517 app results and 12 standalone executable results verified. Run started 2026-11-24T08:00:28+00:00.

Checked artifacts cover 587 of 5,138 casks.

Across all attempts, the CLI reported 10,538,618,364 bytes and 11,560 reads. 3 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| dmg | 423 | 334 | budget_hit 1, executable_not_found 1, host_200_to_range 1, html_response 1, http_403 3, http_404 2, metadata_missing 8, nested_container 6, other 43, other_source_error 7, plist_not_found 6, script_executable 5, timeout 2, unsupported_codec 1, unsupported_container 2, verified 333, verified_executable 1 |
| macho | 4 | 4 | verified_executable 4 |
| pkg | 60 | 36 | budget_hit 5, metadata_missing 1, other_source_error 1, plist_not_found 16, timeout 1, verified 36 |
| tar.bz2 | 3 | 3 | verified 2, verified_executable 1 |
| tar.gz | 12 | 7 | budget_hit 1, metadata_missing 1, other_source_error 1, plist_not_found 1, script_executable 1, verified 3, verified_executable 4 |
| tar.xz | 4 | 2 | other 2, verified 2 |
| tar.zst | 1 | 0 | unsupported_container 1 |
| unknown | 4 | 0 | html_response 1, http_429 1, other_source_error 1, unsupported_container 1 |
| zip | 165 | 143 | executable_not_found 1, host_200_to_range 1, http_403 1, http_404 2, metadata_missing 1, multi_executable 1, nested_container 6, other 2, other_source_error 2, plist_not_found 1, script_executable 4, verified 141, verified_executable 2 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 517 |
| other | 47 |
| plist_not_found | 24 |
| nested_container | 12 |
| verified_executable | 12 |
| other_source_error | 12 |
| metadata_missing | 11 |
| script_executable | 10 |
| budget_hit | 7 |
| http_403 | 4 |
| http_404 | 4 |
| unsupported_container | 4 |
| timeout | 3 |
| html_response | 2 |
| host_200_to_range | 2 |
| executable_not_found | 2 |
| http_429 | 1 |
| unsupported_codec | 1 |
| multi_executable | 1 |

## Architecture hints

- agrees 360
- inconclusive 7
- unavailable 118

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| fx-cast-bridge | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| ftdi-vcp-driver | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| empoche | zip | other | invalid data: ZIP end record missing |
| chef-workstation | dmg | nested_container | not found: app Info.plist in sequential archive |
| zoho-cliq | pkg | timeout | 45s per-attempt deadline |
| aw-edid-editor | zip | metadata_missing | app registration ['AW EDID Editor.app'], scanner bundle AW EDID Editor.app |
| mamp | pkg | budget_hit | byte budget reached; HTTP 200 body, application/octet-stream |
| ai-studio | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| jamovi | dmg | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html |
| zulu@17 | dmg | nested_container | not found: app Info.plist in sequential archive; HTTP 200 body, application/octet-stream |
| vagrant | dmg | nested_container | not found: app Info.plist in sequential archive |
| ijhttp | zip | script_executable | unsupported: declared executable is a script |
| paraview | unknown | other_source_error | source: stream: HTTP 200 supplied Content-Range; HTTP 200 body, application/force-download |
| ifunbox | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| baretorrent | dmg | host_200_to_range | source: range 0-3: HTTP 200 OK (expected 206) |
| steinberg-download-assistant | dmg | script_executable | unsupported: declared executable is a script |
| ampps | dmg | plist_not_found | not found: app or package at the HFS volume root |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| ecamm-live | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| kotlin-lsp | zip | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| logmein-hamachi | zip | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| gingko | zip | other | invalid data: ZIP end record missing |
| stolendata-mpv | tar.gz | other_source_error | source: range 851968-1114111: HTTP 503 Service Unavailable (expected 206) |
| valhalla-space-modulator | dmg | nested_container | not found: app Info.plist in sequential archive |
| elecom-mouse-util | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| ripx | dmg | budget_hit | byte budget reached |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| folding-at-home@beta | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| kobo | dmg | metadata_missing | app registration ['Kobo.app'], scanner bundle Kobo.app |
| tal-drum | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| sys-pc-tool | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| wordpresscom-studio | zip | host_200_to_range | source: range 315348556-315348577: HTTP 200 OK (expected 206) |
| wings3d | dmg | script_executable | unsupported: declared executable is a script |
| sketchup | dmg | plist_not_found | not found: app or package at the HFS volume root |
| wine-stable | tar.xz | other | invalid data: XZ stream |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| ipaverse | dmg | unsupported_container | unsupported: unrecognized file format |
| dropzone | zip | other_source_error | source: range 0-3: representation size changed |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| starnet2 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| rolisteam | dmg | metadata_missing | app registration ['rolisteam.app'], scanner bundle rolisteam.app |
| open-eid | dmg | other_source_error | source: range 0-3: HTTP 412 Precondition Failed (expected 206) |
| orka3 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| windterm | dmg | metadata_missing | app registration ['WindTerm.app'], scanner bundle WindTerm.app |
| tageditor | dmg | plist_not_found | not found: app or package at the HFS volume root |
| openzfs | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| opensesame | dmg | script_executable | unsupported: declared executable is a script |
| wavesurfer | dmg | other_source_error | source: timeout: global |
| lynkeos | zip | other_source_error | source: timeout: global |
| ableton-live-standard | dmg | other_source_error | source: range 3469442131-3469442642: timeout: global |
| cardinal | pkg | budget_hit | byte budget reached |
| temurin | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| psi | dmg | plist_not_found | not found: app or package at the HFS volume root |
| dotnet-sdk@preview | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| go-agent | zip | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| dotnet-sdk@8 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| ringcentral-phone | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| db-browser-for-sqlcipher@nightly | dmg | executable_not_found | not found: CFBundleExecutable in Info.plist |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| enclave | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| cap | unknown | http_429 | source: range 0-3: HTTP 429 Too Many Requests (expected 206) |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| circuitjs1 | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| imagej | zip | script_executable | unsupported: declared executable is a script |
| openzfs | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| anypointstudio | zip | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| krisp | pkg | plist_not_found | not found: app Info.plist in sequential archive; HTTP 200 body, application/octet-stream |
| dcp-o-matic | unknown | html_response | unsupported: unrecognized file format; HTTP 200 body, text/html; charset=UTF-8 |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| adguard-vpn | dmg | other_source_error | source: range 47335066-47335577: timeout: global |
| baidunetdisk | dmg | other_source_error | source: stream: HTTP 200 supplied Content-Range; HTTP 200 body, application/octet-stream |
| rstudio | dmg | unsupported_codec | unsupported: APFS decmpfs-compressed file |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| napari | pkg | budget_hit | byte budget reached |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| chemdoodle | dmg | plist_not_found | not found: app or package at the HFS volume root |
| hydrus-network | zip | executable_not_found | not found: declared executable in ZIP central directory |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| orka-vm-tools | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| unity-ios-support-for-editor | pkg | budget_hit | byte budget reached |
| steam | unknown | unsupported_container | unsupported: unrecognized file format |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| osmc | dmg | metadata_missing | app registration ['qt_host_installer.app'], scanner bundle qt_host_installer.app |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| mysql-shell | dmg | nested_container | not found: app Info.plist in sequential archive |
| scidvsmac | dmg | script_executable | unsupported: declared executable is a script |
| wings3d | dmg | script_executable | unsupported: declared executable is a script |
| chronosync | dmg | nested_container | unsupported: multiple nested PKGs in HFS volume |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| canon-eos-utility | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| segger-embedded-studio | dmg | metadata_missing | app registration [], scanner bundle bin/crashreporter.app |
| netlogo | dmg | plist_not_found | not found: app or package at the HFS volume root |
| codeql-bundle | tar.zst | unsupported_container | unsupported: unrecognized file format |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| write | dmg | other_source_error | source: io: unexpected end of file |
| libndi | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| volt-app | dmg | metadata_missing | app registration ['Volt.app'], scanner bundle Volt.app |
| mini-vmac | tar.gz | metadata_missing | app registration ['Mini vMac.app'], scanner bundle Mini vMac.app; HTTP 200 body, application/x-gzip |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| openvpn-connect | pkg | metadata_missing | app registration [], scanner bundle Contents/Library/LoginItems/OpenVPN Connect.app; HTTP 200 body, binary/octet-stream |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| backuploupe | tar.xz | other | invalid data: XZ stream |
| nvs | tar.gz | plist_not_found | not found: app Info.plist in sequential archive; HTTP 200 body, application/x-gzip |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| display-pilot | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| dingtalk | dmg | other_source_error | source: range 596509424-596509935: timeout: global |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| klayout | dmg | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| virtualbox@beta | dmg | timeout | 45s per-attempt deadline |
| xampp | dmg | other | invalid data: range outside its container |
| carbide-create | dmg | metadata_missing | app registration ['Carbide Create.app'], scanner bundle Carbide Create.app |
| ultimate | zip | nested_container | not found: app Info.plist in sequential archive |
| microsoft-openjdk@11 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| microsoft-outlook | pkg | budget_hit | byte budget reached |
| flutter | zip | multi_executable | Individual targets {'flutter/bin/dart': 'script_executable', 'flutter/bin/flutter': 'script_executable'}. All must verify with one shared strong ETag. |
| eusamanager | pkg | other_source_error | source: range 49058715-49059520: timeout: global |
| sunlogincontrol | dmg | timeout | 45s per-attempt deadline |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-language-pack | dmg | other | not found: bundle path in HFS catalog |
| vienna-assistant | zip | nested_container | scan limit: compressed nested ZIP member exceeds 32 MiB |
| x2goclient | dmg | metadata_missing | app registration ['x2goclient.app'], scanner bundle x2goclient.app |
| sshfs-mac | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| jamovi | dmg | unsupported_container | unsupported: unrecognized file format |
| roaringapps | zip | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| openframeworks | tar.gz | budget_hit | byte budget reached |
| libreoffice-still-language-pack | dmg | other | not found: bundle path in HFS catalog |
| terminal-browser | tar.gz | script_executable | unsupported: declared executable is a script |

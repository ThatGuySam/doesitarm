# Homebrew scanner scoreboard

41/142 artifacts checked. 5 apps, 0 standalone executables, and 1 installed products verified. Run started 2026-11-24T19:31:06+00:00.

Checked artifacts cover 34 of 100 casks.

Across all attempts, the CLI reported 1,650,891,155 bytes and 2,443 reads. 0 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| dmg | 24 | 0 | http_403 2, metadata_missing 2, nested_container 5, other 1, plist_not_found 2, script_executable 11, unsupported_container 1 |
| pkg | 5 | 2 | budget_hit 1, plist_not_found 2, verified 2 |
| tar.gz | 1 | 0 | other_source_error 1 |
| unknown | 1 | 0 | other_source_error 1 |
| zip | 10 | 4 | budget_hit 1, http_404 1, metadata_missing 1, plist_not_found 1, script_executable 2, verified 3, verified_plugin 1 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| script_executable | 13 |
| plist_not_found | 5 |
| verified | 5 |
| nested_container | 5 |
| metadata_missing | 3 |
| http_403 | 2 |
| budget_hit | 2 |
| other_source_error | 2 |
| other | 1 |
| unsupported_container | 1 |
| http_404 | 1 |
| verified_plugin | 1 |

## Architecture hints

- agrees 4
- inconclusive 1
- unavailable 27

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| fx-cast-bridge | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| ftdi-vcp-driver | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| chef-workstation | dmg | nested_container | not found: app Info.plist in sequential archive |
| aw-edid-editor | zip | metadata_missing | app registration ['AW EDID Editor.app'], scanner bundle AW EDID Editor.app |
| mamp | pkg | budget_hit | byte budget reached; HTTP 200 body, application/octet-stream |
| ai-studio | dmg | other | not found: bundle path in HFS catalog |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| jamovi | dmg | unsupported_container | unsupported: unrecognized file format |
| zulu@17 | dmg | nested_container | scan limit: scan deadline reached |
| vagrant | dmg | nested_container | not found: app Info.plist in sequential archive |
| ijhttp | zip | script_executable | unsupported: declared executable is a script |
| paraview | unknown | other_source_error | source: stream: HTTP 200 supplied a partial Content-Range; HTTP 200 body, application/force-download |
| ifunbox | dmg | http_403 | source: range 0-0: HTTP 403 Forbidden (expected 206) |
| baretorrent | dmg | metadata_missing | app registration ['baretorrent.app'], scanner bundle baretorrent.app; HTTP 200 body, application/x-apple-diskimage |
| steinberg-download-assistant | dmg | script_executable | unsupported: declared executable is a script |
| ampps | dmg | plist_not_found | not found: app or package at the HFS volume root |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| ecamm-live | zip | plist_not_found | not found: app Info.plist in ZIP central directory |
| kotlin-lsp | zip | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| logmein-hamachi | zip | http_404 | source: range 0-0: HTTP 404 Not Found (expected 206) |
| stolendata-mpv | tar.gz | other_source_error | source: range 851968-1114111: HTTP 503 Service Unavailable (expected 206) |
| valhalla-space-modulator | dmg | nested_container | not found: app Info.plist in sequential archive |
| elecom-mouse-util | zip | budget_hit | byte budget reached |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| ripx | dmg | nested_container | scan limit: scan deadline reached |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| folding-at-home@beta | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| kobo | dmg | metadata_missing | app registration ['Kobo.app'], scanner bundle Kobo.app |
| wings3d | dmg | script_executable | unsupported: declared executable is a script |
| sketchup | dmg | plist_not_found | not found: app or package at the HFS volume root |

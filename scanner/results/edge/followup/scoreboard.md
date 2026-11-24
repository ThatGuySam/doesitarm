# Homebrew scanner scoreboard

19/24 artifacts checked. 7 apps, 4 standalone executables, and 1 installed products verified. Run started 2026-11-24T19:44:45+00:00.

Checked artifacts cover 18 of 24 casks.

Across all attempts, the CLI reported 3,396,156,201 bytes and 1,389 reads. 2 attempts ended without byte counts.

| Container | Scanned | Verified | Outcomes |
| --- | ---: | ---: | --- |
| 7z | 1 | 1 | verified 1 |
| dmg | 5 | 1 | other_source_error 2, script_executable 2, verified 1 |
| pkg | 7 | 6 | plist_not_found 1, verified 1, verified_executable 4, verified_plugin 1 |
| tar.gz | 3 | 1 | script_runtime_verified 2, verified 1 |
| tar.xz | 1 | 1 | verified 1 |
| zip | 2 | 2 | verified 2 |

## Outcome totals

| Outcome | Count |
| --- | ---: |
| verified | 7 |
| verified_executable | 4 |
| script_runtime_verified | 2 |
| script_executable | 2 |
| other_source_error | 2 |
| plist_not_found | 1 |
| verified_plugin | 1 |

## Architecture hints

- agrees 7
- disagrees 1
- unavailable 4

| Cask | Hint | Expected | Observed |
| --- | --- | --- | --- |
| qt-design-studio | URL path | x86_64 | arm64 |

## Unresolved artifacts

| Cask | Container | Outcome | Evidence |
| --- | --- | --- | --- |
| cursor-cli | tar.gz | script_runtime_verified | unsupported: declared executable is a script |
| terminal-browser | tar.gz | script_runtime_verified | unsupported: declared executable is a script |
| libreoffice-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| libreoffice-still-language-pack | dmg | script_executable | unsupported: declared executable is a script |
| android-studio | dmg | other_source_error | download: 200 1528303381 application/x-apple-diskimage curl: (28) Operation timed out after 65000 milliseconds with 1528303381 out of 1542370765 bytes received |
| soothe2 | pkg | plist_not_found | not found: app Info.plist in sequential archive |
| jabra-direct | dmg | other_source_error | download: 200 159383552 application/octet-stream curl: (28) Operation timed out after 37000 milliseconds with 159383552 out of 270448755 bytes received |

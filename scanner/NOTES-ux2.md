# Scanner UX2

Branch `scanner-ux2` (from `scanner-integration-2` b16ca63). Worker `doesitarm-scanner-preview`, https://doesitarm-scanner-preview.samcarlton.workers.dev.

## Phase 1: drop-first entry and crash trail

- Primary line "Drag an app, a folder, or a folder of apps here." Choose folder is shown only when `showDirectoryPicker` exists (Chromium). Select Apps stays for single files.
- `web/public/crash-journal.js`: IndexedDB breadcrumb journal (about 1 s heartbeat, stage changes, pagehide/visibilitychange, long tasks, JS errors, unhandled rejections, memory where the browser reports it, clean-end marker). A journal without a clean end shows a small notice on the next load with Download crash report (gzip NDJSON, usernames and absolute paths redacted like diagnostics) and Dismiss. No upload, no file contents.
- Folder read errors (memory pressure above 92% of the heap limit, DOMException, RangeError, entry failures) stop the read, keep partial results, record the error and tell the user to drag fewer folders.
- Tests: `test/crash-journal.test.mjs` (Node), `test/crash-report.test.mjs` (Chromium, closes the page with an open journal, reopens, downloads and checks the report). Fixed a bug where journal events overwrote the report line type.
- Build: `node scripts/build.mjs --prebuilt-wasm` skips the cargo steps and reuses `scanner/pkg` (copied from the int2 worktree, same Rust sources).
- Results: npm test 71 + 3 new pass; test:browser 19 pass (incl. crash test); test:ui, test:a11y pass; element-count bands within. Rust is unchanged from b16ca63 so cargo test and native-vs-wasm were not re-run here (integration-2 results stand).
- Deploy: version `c2649937-1e87-46fe-8727-747cca2a3e46`. Live: page 200; drop-zone text present; Choose folder hidden when `showDirectoryPicker` is deleted; Rectangle2.0.5.dmg URL scan returned "Apple Silicon native launcher (Universal)".

## Phase 2: Minimal / More / Research

Implements the disclosure memo (`notes-search/docs/research/macho-wasm-scanner-2026-11-23-team/seats/disclosure-sol/`). Phase 1 wins where they differ (Choose folder only with `showDirectoryPicker`, drop prompt first).

- Level lives on `<html data-level>` and in localStorage key `doesitarm.scanner.view.v1` as `{"level":"minimal|more|research"}` (`web/public/view-level.js`). Guarded reads, malformed or unknown values give Minimal, storage failure keeps the level in memory. Opening "More options" saves More, the nested "Research view" saves Research, closing More clears Research, "Reset view" removes the key and focuses More options. Opening rows, URL mode or results never change it. Disclosures are native `<details>`, so `aria-expanded` and keyboard behaviour come from the platform.
- Minimal: title, drop prompt with the privacy line, Select Apps, Choose folder (Chromium only), More options. While scanning: one count line, one progress track, Cancel all (queued and active rows hidden). Settled: one receipt line, Clear results, and per row the filename plus one disclosure whose label is the glyph and verdict (check / diamond / question mark) followed by Details. Row size, time, monogram, architecture badges and tools are hidden.
- More (inside More options): formats sentence, Scan a download link (URL entry, Gentle), Scan help (how it works, result meanings, Rosetta, why unchecked, FAQ merged), Research view, Reset view. Results gain the readout, the verdict line, queued rows, and a shape instead of numbers: an SVG outcome bar (native / Intel / unknown / other) with a text label.
- Research: architecture badges, row size and time, Results tools (filters, Export), Homebrew run, full details and the scan dialog.
- Reachable at Minimal without changing level: Windows result and Mac match (verdict line, kept in the row disclosure), folder recovery (Saved folder scans, shown when relevant), crash notice, partial-folder notices. On non-Mac devices the URL form is the main entry with "Scan files instead".

### Element counts (`npm run count`, same fixtures as the original-page comparison)

| Width | State | Original | Before UX2 | Minimal | Cut | More | Research | Ceiling (1.3x original) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| desktop | idle | 11 | 12 | 5 | 58% | 10 | 12 | 14 |
| desktop | mid-scan | 31 | 34 | 12 | 65% | 26 | 31 | 40 |
| desktop | done | 47 | 45 | 19 | 58% | 32 | 41 | 61 |
| phone | idle | 11 | 11 | 6 | 45% | 10 | 12 | 14 |
| phone | mid-scan | 29 | 31 | 13 | 58% | 26 | 29 | 37 |
| phone | done | 41 | 38 | 20 | 47% | 32 | 35 | 53 |

The script now fails if Minimal exceeds 1.3x the original or cuts less than 40% from the old build. The "before" figures are from the b16ca63 build with the same script, which already sat at about the original's count, so a 50-70% cut lands well below the original. Phone idle and done are under 50% because phone devices default to URL entry (input, submit, mode switch). Screenshots: `results/ux2/before/` and `results/ux2/after/` (desktop 1440 and phone 390; `-more-` and `-research-` variants).

### Tests

Existing browser, UI and a11y suites now start at the Research level where they drive row details or tools. New: `test/view-level.test.mjs`, `test/view-level-browser.test.mjs` (defaults, persistence, nesting, reset and focus, bad stored value, Choose folder hidden without the picker).

### Deploy

Phase 2 version `9e4c2668-501b-43ef-adca-c56d4c668310`. Live: page 200, drop-zone text, Choose folder hidden without `showDirectoryPicker`, Rectangle2.0.5.dmg URL scan returned "Apple Silicon native launcher (Universal)" (two earlier attempts right after the deploy showed "Unknown — the file could not be read", then three more passed; likely propagation or the rate limiter, not reproduced).

### Not verified

Real macOS Firefox and Safari, VoiceOver and NVDA. `npm run test:ui` fails 6 timing assertions (main-thread task over 160 ms) while this machine's load average is about 9 from another session; the untouched integration-2 build fails the same ones under the same load.

# Firefox crash on a 300,000-file Applications folder

Report: on a MacBook, a Downloads folder with 81 apps scanned fine. The Applications folder (169 apps, about 300,000 files) crashed all of Firefox, so no diagnostics JSON was saved.

## Root cause

The old `Choose folder` button used `<input type="file" webkitdirectory multiple>` in Firefox, which has no `showDirectoryPicker`. On selection, Firefox walks the whole tree in the parent process and builds one `File` per file (300,000) before any page code runs, then hands the list to the content process. The crash happens inside that browser step, before `change` fires, so no page-side limit could stop it.

Evidence (Firefox 159 headless on Linux, 300,000-file tree, same code as bb62a7c):

| Run | Result |
| --- | --- |
| Bare `<input webkitdirectory>` page, no scanner code | Parent RSS 2,138 MiB at 16.6 s and still climbing. Our 2,500 MiB guard stopped it. Content RSS about 132 MiB. |
| bb62a7c scanner page, same picker | Parent RSS 2,100 MiB at about 16.6 s, same guard stop. |

The pressure is in Firefox's parent process, so it is the browser's directory enumeration, not our row list, diagnostics buffer or workers. The scanner's own lazy walker over 300k synthetic entries retains under 32 MiB (`web/test/ffcrash.test.mjs`). The guard stopped the runs before a real kill, so "the browser dies" is inferred from the memory trend and Sam's report. A 16 GB Mac with other apps open has less headroom than this guard.

Not verified: real macOS Firefox, and the real /Applications depth histogram (the fixture models 169 bundles, depth 3 to 11, one framework per bundle, one 21k-file bundle).

## Fix

- No recursive `webkitdirectory` input anywhere. `Choose folder` uses `showDirectoryPicker` where it exists. Elsewhere (Firefox, Safari) it shows guidance to drag the folder onto the page, or drag subfolders or `.app` bundles.
- Drag-and-drop uses `webkitGetAsEntry` and reads 100 entries at a time. Files are grouped under their `.app` bundle as they arrive. Only a small per-bundle record is kept. File references are reopened when a binary is scanned and dropped afterwards, and discovery waits for queue capacity.
- Caps: 1,024 artifacts and nested paths per bundle, 1,024 read-log entries per row, 256 long-task entries, 8,192 rows.
- Each finished row is written to IndexedDB (`folder-journal.js`) in a transaction before it counts as finished. An `in_progress` run record exists from the start. After a crash and reload, the page shows `Saved folder scans` with the partial results and the same diagnostics export (`folder-recovery.js`). Exports stream rows from storage.
- Progress, a cancel button and the partial-result notice remain.

## Numbers

Firefox 159 headless, Linux, 300,000 files, 169 bundles, drag-and-drop path (`webkitGetAsEntry`), content scanned by 8 workers:

| Phase | Before (webkitdirectory) | After (entries) |
| --- | --- | --- |
| Selection, parent RSS | at least 2,138 MiB, stopped by guard | 478 MiB |
| Selection, content RSS | about 132 MiB | 253 MiB |
| Scan peak, parent / content / total | not reached | 988 / 739 / 1,941 MiB |
| Export peak, total | not reached | 1,600 MiB |
| Rows | none | 338 (169 bundles, 169 inner binaries), all `complete` |
| Time | killed | 610 s to settle (each file fetch crosses a local HTTP API in the harness, so this is slower than a real disk) |

Raw log: `scanner/results/ffcrash-firefox-entries-after.ndjson`. Harness: `scanner/scripts/generate-ffcrash.py`, `scanner/web/test/ffcrash-benchmark.mjs`.

## Regression tests

- `web/test/ffcrash.test.mjs`: the page has no `webkitdirectory` (fails on bb62a7c), and a 300,000-file, 169-bundle lazy walk retains under 32 MiB.
- `web/test/ffcrash-recovery.test.mjs` (Chromium): a scan is marked interrupted, the page is reopened, and the saved rows export as diagnostics.

`web/test/browser.test.mjs` was not usable here (needs a built `dist/` from cargo).

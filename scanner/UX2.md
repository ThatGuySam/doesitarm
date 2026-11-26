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

# Integration 2

Branch `scanner-integration-2`, built from `scanner-preview` (bb62a7c) with merge commits only.

## What merged

1. `scanner-wasmsize` (it already contained `scanner-pages`, the download-page resolver). Clean.
2. `scanner-fix-round2` (already contained `scanner-fix-containers`, `-bundles`, `-acquire`, `scanner-ledger`, `scanner-sources`). Two conflicts.
3. `scanner-winscan`. Three conflicts.
4. `scanner-ffcrash`. One conflict.

## Conflicts and resolutions

- `scan-core/src/apfs.rs`, `zip.rs` (round2 vs wasmsize): wasmsize erases reader types with `ContainerReader`; round2 added `ApfsFile::new` and `Status`. Kept both: `ContainerReader::new(&mut ApfsFile::new(device, data))`, and the union of imports.
- `scan-core/src/zip.rs` (winscan vs round2): round2 rewrote app selection (wrapper/flat apps, `scan_without_app`); winscan added a Windows check when no app is found. Kept round2's selection and call `scan_windows` first inside `scan_without_app` for `Target::Auto`.
- `scan-core/tests/formats.rs`: both sides appended tests at the same spot. Took round2's file and appended winscan's 11 new tests and `windows_fixture!` macro.
- `scripts/verify-wasm.mjs`: kept both the bundle-fixture expectations and the Windows fixture comparisons.
- `web/public/worker-pool.js` (ffcrash vs pages): job destructuring keeps `resolvedDownload`, and `file` comes from `job.file ?? await job.openFile?.()` (lazy folder walk).

Follow-up fixes: ffcrash tests added to `npm test` / `npm run test:browser`; `ffcrash-recovery.test.mjs` now sets the `scanner-entry=files` preference because non-Mac browsers open on the URL tab; clippy allows added for lints new in clippy 0.1.99 (`chunks_exact_to_as_chunks`, `manual_is_multiple_of`, `question_mark` in `windows/`; `collapsible_if`/`if_same_then_else` in `page-resolver` and `scan-cli`).

## Kept behaviours (checked in code and tests)

URL default on non-Mac (`download-input.js`, device-entry tests), Windows result (`windows-result.js`, windows-result test), folder recovery (`folder-recovery.js`, `folder-journal.js`, recovery browser test), lazy folder walk, always-hidden usernames (`path-privacy` tests and browser privacy test), gzip diagnostics (50,000-row browser test: 1,450,915 bytes NDJSON.GZ).

## Results

| Check | Result |
|---|---|
| `cargo fmt --check` | pass |
| `cargo clippy --locked --workspace --all-targets -D warnings` | pass after the allows above |
| `cargo test --locked --workspace` | 143 passed, 0 failed |
| `node scripts/verify-wasm.mjs` | 501 native/Wasm comparisons passed |
| `fixtures/edge/check.py`, python unittest | pass, 8 passed |
| `npm test` | 71 passed |
| `npm run test:browser` | 18 passed after the recovery-test fix (1 failed before it) |
| `npm run test:ui` | 10 passed |
| `npm run test:a11y` | pass |
| `npm run count` | all measurements within bands |
| Two identical builds | browser Wasm and Worker Wasm hashes identical across rebuilds |

## Sizes

Browser Wasm 2,780,295 bytes (gzip 850,233, brotli 601,760). Worker Wasm 4,129,530 bytes (gzip 1,332,435, brotli 926,410), which includes the page resolver. The wasmsize branch measured 1,959,784 bytes before Windows parsing and the page resolver were merged into the build; the 24.5 MB to roughly 2 MB win holds (the wasm-release profile applies to both browser and Worker builds).

## Left out

The UX disclosure commits (f6627493 and its three checkpoints) live in `notes-search` (`seats/disclosure-sol`), and are a memo plus an HTML mockup, not scanner code. They do not apply to this repository and were not merged.

Not merged: `scanner-ui`, `scanner-bigfolder`, `scanner-edge`, `scanner-harden`, `scanner-climb`, `scanner-shims` were not requested (some are already ancestors of preview).

## Deploy

See the section below, filled in after deploy.

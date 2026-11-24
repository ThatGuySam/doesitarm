# Scanner preview integration

November 24, 2026. `scanner-preview` starts from the restyled `scanner-ui` at `3c9a7bb`. Merge `589fec5` brings in `scanner-edge` at `f1bd4ee`. Merge `df50493` brings in `scanner-bigfolder` at `1617136`, including its large-folder fixtures and ladder. `scanner-sources` remains outside the branch ancestry.

## Merge resolutions

| Merge | Conflicting files | Resolution |
|---|---|---|
| Edge | Web `app.js`, `index.html` | Kept the restyled results, dialog, totals, and Advanced disclosure. Added binary inventories to row Details and recorded Homebrew results. |
| Edge | Web `local-inputs.js`, `scan-worker.js`, `worker-pool.js` | Combined bundle size reporting and inventory discovery, and tied executable and inventory replies to the current task ID. Kept passive yields, local profile selection, cancellation, and Worker fallback. |
| Big folder | Web `app.js`, `local-inputs.js`, `scan-worker.js`, `worker-pool.js` | Connected the read-only picker, fallback picker, batched discovery, and loaders to the restyled app. The bounded queue retains smallest-first scheduling and cancellation. Local diagnostics keep the exact thin Mach-O read plan. Discovered Mach-O file and nested app results supply folder inventories without rescanning them. The launcher lookup retains the edge branch’s Contents-relative alias. |
| Big folder | Rust CLI `main.rs` | The local folder walker handles directories and uses the edge inventory walker for each app. It preserves the declared launcher, verified same-stem fallback, and script, resource-only, and wrapper statuses. |
| Big folder | Rust `bundle.rs`, `lib.rs`, `macho.rs`, `apfs.rs`, `hfs.rs`, `pkg.rs`, `stream_bundle.rs`, `zip.rs` | Kept edge archive selection, symlinks, aliases, launchers, and inventory limits. Connected big-folder plist, executable-prefix, and load-command evidence to the selected launcher. Recovered package metadata and early sequential candidates retain the associated evidence. |
| Big folder | Wasm `lib.rs` | Kept the edge inventory helpers and the big-folder local diagnostic and metadata exports. |
| Big folder | Web `package.json`, `scripts/build.mjs`, `scripts/ui-smoke.mjs`, `test/browser.test.mjs` | Kept the edge Homebrew sample, worker Wasm factory, and restyled browser assertions. Added build provenance and retained folder discovery, memory guards, and serial Chromium tests. |

The restyled rows use the big-folder result store and mount up to 24 cards. Rows retain Cancel, batch Cancel all, the 5-second timer, and the source-read progress plan. Batch totals count an unpacked app’s known file sizes once, including when a file also has its own row. Directory APIs that leave the full app size unknown report checked results without a fabricated rate. The primary verdict uses the launcher’s verified slices. The extra row summary appears for an observed Intel-only binary when the main executable has a verified non-Intel slice. Details lists the observed paths, roles, architecture slices, minimum macOS versions, and signature-command evidence. Browser directory inventories are partial because the folder APIs expose limited filesystem evidence.

## Exports and privacy

Downloads default to gzip-compressed NDJSON written incrementally with `CompressionStream` in a browser worker. Plain JSON and clipboard JSON are available for runs under 5,000 settled rows. Successful diagnostics retain the full parsed Info.plist and Mach-O evidence. They omit empty fields, duplicated plist key lists, and repeated main-executable candidate records. Failure records retain reproduction evidence. The fixture converter accepts `.ndjson.gz`, existing `.ndjson`, and `.json` exports.

The rendered app, raw JSON, Worker responses, clipboard output, and downloads replace macOS, Linux, and Windows home-directory usernames with `/Users/<user>/`. The browser keeps real paths in the scan state for opening files and matching bundle members. The redaction also covers nested plist strings and path-bearing values in exported diagnostic bytes. The page offers this protection automatically.

## Verification

Rust 1.99.1, Node 26.13.0, wasm-bindgen-cli 0.2.130, and Linux headless Chromium 155.0.8059.84.

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` and `cargo clippy --locked -j2 --workspace --all-targets -- -D warnings` | Passed |
| `cargo test --workspace --locked -j2` | 50 passed |
| `node scripts/verify-wasm.mjs` | 222 native/Wasm comparisons passed, plus boundary, callback, and profile checks |
| `python3 fixtures/edge/check.py --cli target/debug/scan-cli` | 31 generated edge fixtures passed |
| `python3 -m unittest discover -s scripts -p 'test_*.py'` | 6 passed |
| `npm test` from `scanner/web` | 36 passed, including 15 Worker tests |
| `npm run test:browser` | 10 passed, including read-only directory handles, 50,000-row paging, structured diagnostics, and rendered and copied privacy checks |
| `npm run test:ui` | 10 passed, including both cancellation paths, the 5-second timer, and a local archive that decoded 68,161,536 bytes |
| `npm run test:a11y` | 18 passed |
| `npm run count` | All six measurements inside the original ±10% bands |
| `node scripts/build.mjs` from `scanner/web` | Passed. Built browser Wasm, capped Worker Wasm and its isolated instance factory, and static assets |

| Width | Idle, original → preview | Mid-scan, original → preview | Done, original → preview |
|---|---:|---:|---:|
| 1440 px | 11 → 11 | 31 → 33 | 47 → 44 |
| 390 px | 11 → 11 | 29 → 31 | 41 → 38 |

The 50,000-row diagnostics fixture produced **1,450,782 bytes** of gzip-compressed NDJSON, down 99.05% from the 152,940,575-byte JSON baseline in [BIGFOLDER.md](web/BIGFOLDER.md). The run took 6.44 s with 878 MiB peak Chromium RSS and zero main-thread tasks at or above 50 ms. The 4,999-row plain JSON check produced 12,464,855 bytes. Both formats preserved the complete fixture plist and Mach-O evidence, and all three exported failures replayed through the native CLI. The separate 50,000-result view mounted 24 rows with 1,469 initial connected elements and zero tasks at or above 50 ms.

The browser’s direct URL and file scans use `local`. Diagnostic file scans select the same profile in Wasm. The Worker uses `worker` with its 8 MiB request budget, 64 MiB decoded-byte limit, 20 s deadline, 80 MiB Wasm memory ceiling, and configured 5,000 ms CPU and 36-subrequest limits. Unit tests exercise the Worker profile, budget, deadlines, memory ceiling, and instance reset. The browser package has no declared Wasm memory maximum and the Worker package declares 1,280 pages.

### Folder ladder

The real Chromium `drop-entry` route matched result paths, statuses, verified architectures, parents, and roles against the independent fixture manifest.

| Files | Results matched | First card | Last result | Peak Chromium RSS | Mounted rows | Longest task ≥ 50 ms |
|---:|---:|---:|---:|---:|---:|---:|
| 10,000 | 125/125 | 316 ms | 2.94 s | 995 MiB | 24 | 63 ms |
| 100,000 | 675/675 | 332 ms | 17.39 s | 1,115 MiB | 24 | None |

These measurements ran during the Wasm rebuild. The benchmark no longer waits for the collapsed Homebrew table to open. The manifest comparison caught a script-launcher status regression, now covered at both scales.

The Linux native Chromium picker also matched both manifests with symlink fixtures disabled. The loader appeared about 2 ms after delivery of the FileList at each scale.

| Picker files | Results matched | Last result | Native task crossing the change event | Longest task after change | Peak Chromium RSS |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 125/125 | 5.87 s | 1.98 s | 90 ms | 1,085 MiB |
| 100,000 | 675/675 | 75.81 s | 19.68 s | 125 ms | 1,963 MiB |

## Worker build for the lead

From the preview worktree on Omarchy, with the installed wasm-bindgen-cli:

```sh
cd "$HOME/Code/doesitarm-scanner-preview/scanner/web"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
export WASM_BINDGEN="$HOME/Code/doesitarm-scanner/scanner/target/tools/bin/wasm-bindgen"
npm ci
node scripts/build.mjs
```

A fresh machine needs the Rust target `rustup target add wasm32-unknown-unknown` and wasm-bindgen-cli 0.2.130 from `cargo install --locked -j2 wasm-bindgen-cli --version 0.2.130`. The build also finds `wasm-bindgen` on `PATH` when `WASM_BINDGEN` is unset. It writes the browser package under `scanner/pkg`, the capped Worker package under `scanner/pkg/worker`, and the Worker’s static assets under `scanner/web/dist`. The configured Worker entry point is `scanner/web/worker/index.js`.

## Unverified

Live Cloudflare routing and isolate behavior, macOS Finder and native permission dialogs, Safari, Firefox, physical touch devices, and screen-reader speech are outside these offline checks.

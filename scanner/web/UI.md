# Browser scanner UI

November 24, 2026. This worktree is `~/Code/doesitarm-scanner-ui` on `scanner-ui`, based on merge commit `5a7e79a`. All tracked changes are under `scanner/web/`.

## Parallel scan audit

- The merged page already used dedicated module workers. It had a fixed pool of up to four slots, FIFO dispatch, and a ten-second idle retirement timer. Its progress fraction used physical source size even when the parser could finish after reading a few ranges.
- Independent apps now overlap across worker threads. A worker runs one file, bundle, or URL job at a time and reuses one Wasm instance between jobs. Within a job, Wasm follows each artifact's reads serially. A DMG reader requests ranges of the original `File` using `File.slice()`. The browser allocates the requested ranges, WebAssembly memory, and decoder buffers as needed.
- The page thread handles file picking, directory discovery, resolving the executable named in `Info.plist`, queue scheduling, and DOM updates. It passes `File` handles to the workers. The workers do the reads, plist parsing, decoding, and Wasm scanning. A mode change is cooperative between reads, so an uninterrupted decoder call can keep its worker busy until it returns.
- The interface carries over the existing site's Select Apps action, centered title, dark palette, and shared list of per-app rows with monograms, status, and expandable details. The reference is `pages/apple-silicon-app-test.vue` in the main Does It ARM checkout. File and folder drops, URL scans, JSON details, and Homebrew rescans use the existing vanilla page.

## Scheduling and progress

- Automatic mode is the default. With a visible, focused page, the pool allows `max(1, hardwareConcurrency - 2)` active scans up to six. An unfocused or hidden page uses one worker on devices reporting up to four logical cores and two on larger devices. Gentle, Save-Data, or an unplugged battery at 20% or below select one worker. Gentle persists in local storage.
- Passive workers yield at source read boundaries with `scheduler.postTask()` at background priority, or a timer fallback. A downshift lets current scans finish and waits to start more until the active count is under its new cap. Idle workers beyond the cap retire immediately. Foreground workers skip the explicit yields. [Prioritized Task Scheduling draft](https://wicg.github.io/scheduling-apis/)
- Queue priority uses ascending file size because smaller selections often return results sooner. Equal sizes keep submission order. URLs and directory drops whose sizes would require another walk join after sized inputs and keep their own arrival order. Folder-picker bundles use the sum of files already present in the picker, while a dropped bundle reads its declared executable without walking the bundle's other assets.
- The bar is determinate once the bare thin Mach-O scanner requests its final load-command table, including the prefix reads and any bundle plist reads. Fat Mach-O, archives, disk images, and URL requests use indeterminate progress while their total work is open-ended. The readout counts completed source reads, including rereads. Canceled rows keep their last reported count. For Cloudflare fallback it adds the server-reported unique source bytes when the result returns. JSON keeps the core's unique coverage and attempted byte counts.
- A scan's elapsed timer appears after five seconds and displays whole seconds. A polite announcement marks the first appearance. ETA requires increasing read samples spanning at least two seconds, with similar per-sample rates and a known total. The batch ETA also requires a usable estimate for every remaining job. The batch bar counts settled jobs, including errors and cancellations, with cancellations called out separately. Adding jobs to a batch already showing progress makes its bar indeterminate until the enlarged batch settles. Earlier results stay in the list when a fresh batch starts.
- Individual cancellation removes a queued item or terminates its active worker. Other jobs keep their slots and the queue uses a replacement worker as needed. Cancel all also stops current directory discovery, clears the queue, and terminates the pool. It ends the browser job for a Cloudflare request. Any server work that already started remains subject to the server's deadline.
- Files, bundles, and direct browser CORS URL scans use the merged `local` profile without an app-enforced overall byte budget or deadline. This supersedes the direct browser URL tier description in `../PROFILES.md` for this branch. The CLI URL ladder and Cloudflare Worker profile still apply to their respective hosts. Format bounds, including the core's 2 MiB `Info.plist` bound, and browser memory limits still apply.

## Chromium measurements

The source smoke suite measures the unthrottled workload on the four-core Omarchy host with Chromium 155.0.8059.84. Each mixed batch uses a fresh page and the same blend of Mach-O, ZIP, DMG, PKG, and tar.gz inputs. The inputs range from 72 B to 16 MiB and include an 8 MiB incompressible tar prefix that the scanner traverses. The timer and cancellation cases use separate delayed reads.

| Batch | Overlapping workers | Wall time | Main-thread task time | Longest task ≥50 ms | Chromium PSS start → peak | Wasm / V8 heap per worker |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 10 mixed, Foreground | 2 | 0.59 s | 217 ms | — | 356 → 449 MiB | 4.8–5.9 / 0.7 MiB |
| 30 mixed, Foreground | 2 | 1.11 s | 399 ms | — | 360 → 475 MiB | 5.9 / 0.9 MiB |
| 100 mixed, Foreground | 2 | 2.38 s | 595 ms | 95 ms | 361 → 549 MiB | 5.9 / 1.1–1.2 MiB |
| 30 mixed, Gentle | 1 | 0.84 s | 222 ms | — | 363 → 452 MiB | 5.9 / 0.8 MiB |
| Folder drop, 120 apps | 2 | 1.20 s | 489 ms | — | 363 → 462 MiB | 1.3 / 0.6 MiB |
| Sparse 5 GiB Mach-O | 1 | 0.33 s | 73 ms | — | 355 → 404 MiB | 1.3 / 0.5 MiB |

Wall time includes input handling and the final count update. The overlap is the number of simultaneous intervals from each worker's first actual file read to its result. Main-thread time is cumulative CDP task duration. The single 95 ms long task contributed 45 ms past the 50 ms threshold. The other rows had zero reported long tasks. [Long Tasks API draft](https://wicg.github.io/longtasks/)

PSS is the combined Chromium process footprint sampled every 35 ms. Workers can share a renderer. The per-worker columns show Wasm linear allocation and V8 heap in use after the batch. CDP also reported up to 43.6 MiB of backing storage in each worker after the 100-file run. These isolate snapshots do not measure per-worker resident memory or peaks between samples. [Chrome DevTools Runtime protocol](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)

The sparse input used 8 KiB of disk blocks and read 192 unique source bytes while verifying a slice past 4 GiB. The built-page regression scanned 12 links to the same sparse inode in 390 ms, with Chromium PSS rising from 446 to 452 MiB. A separate browser archive scan completed after decoding 68,160,560 bytes from 66,875 unique source bytes, above the Worker decoded-byte limit.

## Verification and remaining coverage

Run these from `scanner/web` with Node, Python 3, `/usr/bin/chromium`, cached Cargo dependencies, and `wasm-bindgen` on PATH or set via `WASM_BINDGEN`. On this host the merge worktree has the tool at `~/Code/doesitarm-scanner/scanner/target/tools/bin/wasm-bindgen`. Install the locked npm dependencies before going offline. The tests use loopback HTTP, local fixture files, and simulated URL responses.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
export CARGO_NET_OFFLINE=true
npm run build
cargo build --manifest-path ../Cargo.toml --locked -j2 -p scan-cli
npm test
npm run test:browser
npm run test:ui
```

- All 23 Node tests passed. The suite covers worker dispatch, stable queue order, live resizing, cancellation and stale callbacks, ETA math, and the existing Cloudflare handler.
- All five built-page Chromium regression cases passed. They cover CLI parity across formats, file and folder selection, sparse offsets, CORS and fallback responses, and the Homebrew table.
- All nine source smoke cases passed. They test actual reads and mode changes in one headless browser, keyboard cancellation and focus, the elapsed timer and ETA, reduced motion, responsive widths, a 120-app folder drop, and sparse-file reads. It closes Chromium and removes its temporary fixture directory under `~/.cache`.
- Firefox, Safari, macOS Finder package drops, and real assistive-technology announcements remain unverified. Directory access depends on the browser exposing entries or handles. If a package drop exposes only a file, the folder picker or a ZIP lets the scanner inspect its contents. Background tab throttling, suspension, and per-engine memory constraints are browser behavior. [WebKit directory upload](https://webkit.org/blog/8170/clipboard-api-improvements/#directory-upload)

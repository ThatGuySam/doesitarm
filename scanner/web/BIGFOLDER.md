# Large local folder scans

Worktree `~/Code/doesitarm-scanner-bigfolder`, branch `scanner-bigfolder`, based on scanner-ui `1c0c8d9`. Keep commits local and use `cargo -j2`. Run a single Chromium instance after checking `free -m`. The Linux browser harness stops if available memory drops below 2.5 GiB or Chromium exceeds 2,500 MiB RSS.

## Resume

- Folder walking, the scan queue, loader, paginated results and both diagnostics formats are checkpointed. The Rust workspace passes 50 tests and the parity script passes 190 native/Wasm comparisons.
- The serial 50,000-row export trial produced JSON at 152,940,575 bytes in 1.86 s and NDJSON at 154,240,575 bytes in 1.78 s. Peak Chromium RSS was 1,033 and 1,136 MiB, respectively. Both stayed below the 200 MiB fixture budget with zero tasks of 50 ms or more. The converter rebuilt and replayed a missing executable, a script launcher and a launcher-less wrapper from each format. Production file size depends on the original plists, command counts, directory listings and read logs.
- Full headless directory-drop ladder completed. Raw optimized reports are `/tmp/bigfolder-optimized-drop-small.json` and `/tmp/bigfolder-optimized-drop-large.json`. The native alternate picker report is `/tmp/bigfolder-final-native-picker.json`. The harness removes each owned tree after its rung.
- From `scanner/web/`, run `npm test` for Node tests and `npm run test:browser` for serial Chromium tests. Build the native test oracle with `cargo build --locked -j2 -p scan-cli` from `scanner/` and browser assets with `npm run build` from `scanner/web/`. Set `WASM_BINDGEN` if the tool is outside `PATH`.

## Browser and native evidence

The browser reuses the status, architecture and binary inventory shape from `scanner-edge`. Its inventory is marked partial because folder picker and drop APIs expose a subset of filesystem evidence. It reports only what it positively observed. It preserves the nearest enclosing app as `parent_bundle_path`, even when the enclosing app's own executable is missing. The native walker identifies and skips symlink loops and duplicate directory aliases. Browser directory APIs may omit symlink metadata and targets entirely. The export marks that capability unavailable and records duplicates, depth guards and read errors it can observe.

Chromium's native folder input can enumerate the selection and show an `Upload N files` confirmation before JavaScript gets a `change` event. The page can show its loader as focus returns. On supported browsers it first opens `showDirectoryPicker({ mode: 'read' })`, which starts the scan from a directory handle. Chromium restricts File System Access for both `/Applications` and `~/Applications` on macOS. The alternate folder picker is visible from the start on macOS and becomes available elsewhere if direct access closes without returning a handle. The directory-entry fallback drains `readEntries()` until it returns an empty batch. [File System Access specification](https://wicg.github.io/file-system-access/#api-showdirectorypicker) · [Chromium folder API documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) · [Chromium macOS restricted paths](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc#619)

The Chromium FileList is live. Clearing the input after `change` empties the list, so the scanner clears it after discovery completes and only if it still owns that selection. Chromium also snapshots metadata synchronously when JavaScript accesses native `File.size` or structured-clones a native `File` to a worker. The scanner checks its time slice after every entry. On the legacy directory-drop path, Chromium's optional asynchronous `getMetadata()` avoids creating Blob snapshots for files too small to carry a Mach-O magic number. [Chromium File serialization](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/bindings/core/v8/serialization/v8_script_value_serializer.cc#896) · [Chromium legacy Entry interface](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/filesystem/entry.idl#45)

## Native file-picker limits observed in headless Chromium

| Files | First card | Last result | Native task crossing `change` | Longest task after `change` | Peak Chromium RSS | Correct |
|---:|---:|---:|---:|---:|---:|---:|
| 10,000 | 3.47 s | 4.10 s | 1.27 s | None ≥ 50 ms | 1,029 MiB | 125/125 |
| 100,000 | 54.07 s | 57.33 s | 14.64 s | 453 ms | 1,971 MiB | 675/675 |
| 300,000 | — | — | — | — | 2,509 MiB at stop | No `change` delivered |

The 100,000-file run preceded the per-entry time-slice check. The 300,000-file run reached the guard during browser-native FileList construction with a 2.75 MiB page heap. The 500,000-file native picker rung was omitted at this memory cap. The real native upload confirmation and macOS permissions are outside the headless Linux test surface.

## Real directory-drop scale

Linux headless Chromium 155.0.8059.84 opened a real directory dragged through CDP, using Chromium's legacy `FileSystemEntry` API. Each rung used a fresh browser, two foreground scan workers and the local profile. Times start immediately before submitting the drop. The fixture generator includes nested apps, archive and raw binary rows, symlinks, unusually deep paths and special names. Most resource fillers are zero-byte files. Correctness compares the exported paths, status, verified architecture names and nested relationships with an independent manifest. The generator used up to 516,449 filesystem entries and stayed below the disk ceiling.

| Files | Skeleton | First card | First result | Last result | Results/s | Peak JS heap | Peak Chromium RSS / PSS | Peak DOM nodes | Longest task | Matched |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10,000 | 70 ms | 283 ms | 412 ms | 2.23 s | 56 | 7 MiB | 948 / 399 MiB | 4,029 | None ≥ 50 ms | 125/125 |
| 100,000 | 72 ms | 534 ms | 679 ms | 12.59 s | 54 | 25 MiB | 1,067 / 523 MiB | 4,455 | None ≥ 50 ms | 675/675 |
| 300,000 | 73 ms | 433 ms | 1.34 s | 36.90 s | 54 | 34 MiB | 1,195 / 751 MiB | 4,177 | 61 ms | 1,995/1,995 |
| 500,000 | 56 ms | 505 ms | 2.05 s | 60.69 s | 55 | 38 MiB | 1,254 / 705 MiB | 4,139 | 109 ms | 3,315/3,315 |

Peak JavaScript heap is the sampled page renderer heap. RSS sums Chromium processes and can count shared pages more than once. CDP's peak DOM count includes detached nodes. Both the largest rung and the smallest rung ended with 1,326 connected elements and 24 mounted result cards. The 300,000-file run recorded tasks of 51 and 61 ms. The 500,000-file run recorded tasks of 64 and 109 ms. These two rungs missed the under-50-ms target. Before the metadata preflight, 100,000-file drop discovery took 50.38 s end to end and the 300,000-file run disconnected.

A separate 500,000-file diagnostic trace again matched 3,315/3,315, including strict parent and role comparisons. Tracing raised the elapsed scan time to 88.52 s and peak RSS to 1,969 MiB. One 53 ms task used 22.1 ms of renderer CPU and included a minor V8 collection. A 105 ms task used 9.5 ms of renderer CPU and included an 80 ms layout interval that consumed 3.7 ms of that CPU time. The trace buffer filled after 32.3 s, before the third reported task at 52.2 s. The two captured tasks establish a difference between elapsed task time and active renderer time. They do not identify the cause of the third task. The compact observer report is `/tmp/bigfolder-500k-traced.json`.

From `scanner/web/`, run `node test/bigfolder-benchmark.mjs --route drop-entry --output /tmp/bigfolder-drop.json` to repeat the full ladder. `--files` selects a comma-separated subset. The `picker` route submits a directory to the real `webkitdirectory` input via CDP, and `--no-symlinks` removes fixtures that the native picker may treat differently across platforms. The `file-list` route injects an indexed input into the same `change` handler. Its empty fillers expose file metadata and its nonempty entries provide real File objects. This isolates post-change work from native picker construction and Chromium's repeated rebuilding of the DataTransfer FileList. The 500,000-entry indexed trial matched 3,315/3,315 in 11.38 s at 1,330 MiB RSS with one 87 ms task. [Chromium DataTransfer implementation](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/third_party/blink/renderer/core/clipboard/data_transfer.cc#462)

The serial browser suite used real OPFS handles for both the read-only directory picker and the preferred drop-handle branch. It simulated the picker and handle delivery because headless Linux has no macOS permissions UI. The 50,000-result paging test mounted 24 cards and held at 995 connected elements across filtering, sorting, paging and scrolling. It observed no tasks of 50 ms or more.

Verification passed with 50 Rust tests, 190 native/Wasm comparisons, 25 Node tests, nine serial browser tests and ten offline UI smoke tests. The UI smoke test caught a change to the thin Mach-O read plan during the diagnostics refactor. The worker now reuses the format probe and preserves exact determinate progress and ETA for those files.

## AgentSessions 3.8.2

The tagged source plist has the bundle ID `com.triada.AgentSessions` and omits `CFBundleExecutable`. The published 17,680,366-byte DMG matched SHA-256 `5b0205c1c8107d0e0e5562d5f324e474b73caeb49c87d6332b2bf43cec78b0ab`. Targeting `AgentSessions.app/Contents/MacOS/AgentSessions` verified x86_64 and arm64 headers, minimum macOS 14.0 and signature-command presence in both slices. This is a conventional app layout with an omitted key. The same-stem fallback uses that one path and requires a verified Mach-O. An unrelated helper or same-stem script never supplies the app's architecture. [Tagged plist](https://raw.githubusercontent.com/jazzyalex/agent-sessions/v3.8.2/AgentSessions/Info.plist) · [Published release](https://github.com/jazzyalex/agent-sessions/releases/tag/v3.8.2)

## Reproduction fixtures

| Directory under `scanner/fixtures/bigfolder/` | Expected scan |
|---|---|
| `agentsessions-no-key` | Exact same-stem launcher gives verified slices with `bundle_name_fallback`. |
| `missing-executable-key` | No verified same-stem launcher gives `no_executable`, even with a Mach-O elsewhere in the app. |
| `missing-executable-file` | Absent declared launcher gives `no_executable` with `missing_executable_file`. |
| `resource-only-bundle` | `BNDL` and resources give `resource_only`; localized InfoPlist.strings stays a resource. |
| `wrapper-nested-flat` | Outer wrapper has its own status. The flat inner app has its own launcher, binary plist and parent path. |
| `contents-relative-bom` | UTF-8 BOM and a declared `Contents/Tools` executable still resolve. |
| `script-launcher` | Declared shebang yields `script` with zero Mach-O architectures. |
| `symlink-loop` | Native walker skips loops and duplicate aliases. |
| `secondary-macos-binary` | The helper has an independent Mach-O row beside the app. The main executable appears once. |
| `archive-as-executable` | An archive at the declared launch path yields `invalid` with `executable_not_macho`. |

Use `node scanner/scripts/diagnostics-to-fixtures.mjs diagnostics.ndjson` from the repo root to create skeletons in the fixture tree. The optional second argument selects a different output directory. Each skeleton contains `repro.json`, a README with the native CLI command, the matching diagnostic record, and any files reconstructable from the export. An embedded archive, unavailable plist or executable beyond the prefix may require the original files listed in the reproduction evidence.

## Do we need MCP for the Mac?

Start with Download diagnostics, which collects the local run and both outcomes in one file, and use the native CLI for an independent view of the folder. On an Apple Silicon Mac with the branch checked out and Rust installed, run `cargo build --locked -j2 --release --target aarch64-apple-darwin -p scan-cli` from `scanner/`, then `./target/aarch64-apple-darwin/release/scan-cli scan /Applications --profile local --json > applications-scan.json`. It streams an array of relative paths, parent bundles, roles, statuses, verified slices, minimum macOS, and read counts. Give it a single `.app` path to replay a bundle. MCP would add live access to the Mac so an agent could independently inspect permissions, symlinks, extended attributes, code signing, or a full executable with `otool` after approval. The local export and CLI cover the first diagnostic pass.

## Checkpoints

- `b403b3c` shares the local plist, executable resolution and role rules with Wasm.
- `5a4917a` adds the native local folder path and six Rust integration tests covering eight fixtures.
- `084b3d0` adds complete parsed plist and executable evidence for local archive formats.
- `d19e90c` adds the folder walk and bounded stable priority queue.
- `6e69274` captures local scan evidence in the browser worker.
- `6980c41` adds JSON and NDJSON export and the fixture skeleton converter.
- `2a8f737` connects folder preparation and paginated scan results to the UI.
- `5cc1b26` separates sibling Mach-O rows from the main launcher and prevents an archive from lending its architecture to a local app.
- `3d4b2f6` fixes the live FileList lifetime and moves short-file discovery to asynchronous metadata when available.
- `b018329` checks the time slice after each native FileList entry.
- `d847b0b` supplies the real directory-drop fixture generator, scale ladder and memory guard.
- `eb0b73f` preserves exact thin Mach-O progress while collecting diagnostic evidence.
- `2756e21` verifies folder inputs, paginated results, local diagnostics and native fixture replay.
- `1e23001` isolates after-change discovery from browser-native FileList construction.

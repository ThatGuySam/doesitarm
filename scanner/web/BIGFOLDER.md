# Large local folder scans

Worktree `~/Code/doesitarm-scanner-bigfolder`, branch `scanner-bigfolder`, based on scanner-ui `1c0c8d9`. Keep commits local and use `cargo -j2`. Run a single Chromium instance after checking `free -m`. The Linux browser harness stops if available memory drops below 2.5 GiB or Chromium exceeds 2,500 MiB RSS.

## Resume

- Folder walking, the scan queue, loader, paginated results and both diagnostics formats are checkpointed. The Rust workspace passes 50 tests and the parity script passes 190 native/Wasm comparisons.
- The 50,000-row export passed its first headless trial. JSON was 150,240,117 bytes and NDJSON was 151,540,117 bytes. Both stayed below the 200 MiB synthetic test budget with zero reported tasks of 50 ms or more. The fixture converter produced all three missing-executable skeletons from each format. Production size depends on the original plists, command counts, directory listings and read logs.
- The resumed native file-picker results are in `/tmp/bigfolder-final-native-picker.json`. The first real directory-drop results are in `/tmp/bigfolder-resume-drop-entry.json`. The optimized directory-drop run is underway with separate browser processes per rung. The harness removes each owned tree after its rung.
- Run the browser tests serially with `node --test --test-concurrency=1 test/bigfolder-*.test.mjs test/browser.test.mjs` from `scanner/web/`. Build assets first using `npm run build` with `WASM_BINDGEN` set if the tool is outside `PATH`. Run ordinary web tests with `npm test`.

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

The 100,000-file run preceded the per-entry time-slice check. The 300,000-file run reached the guard during browser-native FileList construction with a 2.75 MiB page heap. A 500,000-file native picker run at the same memory cap would be unsafe to start on this host. The real native upload confirmation and macOS permissions are outside the headless Linux test surface.

## AgentSessions 3.8.2

The tagged source plist has the bundle ID `com.triada.AgentSessions` and omits `CFBundleExecutable`. The published 17,680,366-byte DMG matched SHA-256 `5b0205c1c8107d0e0e5562d5f324e474b73caeb49c87d6332b2bf43cec78b0ab`. Targeting `AgentSessions.app/Contents/MacOS/AgentSessions` verified x86_64 and arm64 headers, minimum macOS 14.0 and signature-command presence in both slices. This is a conventional app layout with an omitted key. The same-stem fallback uses that one path and requires a verified Mach-O. An unrelated helper or same-stem script never supplies the app's architecture. [Tagged plist](https://raw.githubusercontent.com/jazzyalex/agent-sessions/v3.8.2/AgentSessions/Info.plist) · [Published release](https://github.com/jazzyalex/agent-sessions/releases/tag/v3.8.2)

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

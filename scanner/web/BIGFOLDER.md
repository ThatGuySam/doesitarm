# Large local folder scans

Worktree `~/Code/doesitarm-scanner-bigfolder`, branch `scanner-bigfolder`, based on scanner-ui `1c0c8d9`. Keep commits local and use `cargo -j2`. Run a single Chromium instance after checking `free -m`. The Linux browser harness stops if available memory drops below 2.5 GiB or Chromium exceeds 2,500 MiB RSS.

## Resume

- Folder walking, the scan queue, loader, paginated results and both diagnostics formats are checkpointed. The 48 Rust tests pass against the recovered commits.
- The 50,000-row export passed its first headless trial. JSON was 150,240,117 bytes and NDJSON was 151,540,117 bytes. Both stayed below the 200 MiB synthetic test budget with zero reported tasks of 50 ms or more. The fixture converter produced all three missing-executable skeletons from each format. Production size depends on the original plists, command counts, directory listings and read logs.
- The resumed scale runs write progress to `/tmp/bigfolder-resume-picker.json` and `/tmp/bigfolder-resume-drop-entry.json`. Copy verified results here when they finish. Remove owned generated trees after each rung.
- Run the browser tests serially with `node --test --test-concurrency=1 test/bigfolder-*.test.mjs test/browser.test.mjs` from `scanner/web/`. Build assets first using `npm run build` with `WASM_BINDGEN` set if the tool is outside `PATH`. Run ordinary web tests with `npm test`.

## Browser and native evidence

The browser reuses the status, architecture and binary inventory shape from `scanner-edge`. Its inventory is marked partial because folder picker and drop APIs expose a subset of filesystem evidence. It reports only what it positively observed. It preserves the nearest enclosing app as `parent_bundle_path`, even when the enclosing app's own executable is missing. The native walker identifies and skips symlink loops and duplicate directory aliases. Browser directory APIs may omit symlink metadata and targets entirely. The export marks that capability unavailable and records duplicates, depth guards and read errors it can observe.

Chromium's native folder input can enumerate the selection and show an `Upload N files` confirmation before JavaScript gets a `change` event. The page can show its loader as focus returns. On supported browsers it first opens `showDirectoryPicker({ mode: 'read' })`, which starts the scan from a directory handle. Chromium restricts File System Access for both `/Applications` and `~/Applications` on macOS. The alternate folder picker is visible from the start on macOS and becomes available elsewhere if direct access closes without returning a handle. The directory-entry fallback drains `readEntries()` until it returns an empty batch. [File System Access specification](https://wicg.github.io/file-system-access/#api-showdirectorypicker) · [Chromium folder API documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) · [Chromium macOS restricted paths](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc#619)

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

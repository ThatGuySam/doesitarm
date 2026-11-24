# Does It ARM scanner web handoff

Build B completed on November 24, 2026, Central time. The work is committed locally on `scanner-wasm`. The existing site and Workers were left alone.

## Open the preview

Open `doesitarm-scanner-preview` in [Workers & Pages](https://dash.cloudflare.com/8d4ef8fe891f53e5658d3fdd5a4c7630/workers-and-pages) and choose **Visit**. Wrangler 4.165.0 deployed the Worker on workers.dev. An independent deployment listing confirmed 100% of traffic assigned to the version below.

| Cloudflare record | Value |
| --- | --- |
| Worker | `doesitarm-scanner-preview` |
| Version ID | `e7940d5a-3c4d-49a7-bd62-3f561689db68` |
| Deployment ID | `691d57e3-32d8-4f0e-bc39-13d8ac7765fb` |
| Bindings | Static assets and a Worker rate limiter |
| Deployment scope | workers.dev, with version preview URLs disabled |

A content filter blocked use of the generated preview address during verification. The address is in Wrangler’s deployment output and on the Worker dashboard. **Live curl checks of the page and API are unverified.** The public inputs below were fetched and scanned through the same handler and Wasm running in Node. Both matched the native CLI’s HTTPS output field for field.

| Public input | HTTP | Architectures | Accepted bytes | Range reads |
| --- | --- | --- | --- | --- |
| [LLVM hello-world Mach-O fixture](https://raw.githubusercontent.com/llvm/llvm-project/main/llvm/test/Object/Inputs/hello-world.macho-x86_64) | 200 | x86_64 | 1,333 of 8,496 | 5 |
| [Firefox 160.0.1 cask DMG](https://download-installer.cdn.mozilla.net/pub/firefox/releases/160.0.1/mac/en-US/Firefox%20160.0.1.dmg) | 200 | x86_64, arm64 | 770,031 of 165,761,466 | 8 |

## Build and test

Run from `scanner/web` with Rust 1.99.1, the `wasm32-unknown-unknown` target, Node 26.13.0, and `wasm-bindgen-cli` 0.2.130. The build finds Build A’s installed tool in `../target/tools/bin` first, then falls back to `PATH`. Set `WASM_BINDGEN` to override its location.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
npm ci
npm run build
cargo build --manifest-path ../Cargo.toml --locked -j2 -p scan-cli
npm test
npm run test:browser
```

The build regenerates `scanner/pkg/` and assembles `scanner/web/dist/` with the client Wasm and the recorded 30-cask Homebrew run. Both generated directories are ignored by Git. `npm run serve` serves the static preview on `127.0.0.1:8787`, including local scans and direct browser URL reads. Use the deployed preview for Cloudflare scans. The browser test starts and closes its own loopback server with the API handler injected.

To reproduce Wrangler’s build and deploy from `scanner/web` with the existing login, use the explicit configuration path. The bundler warned about the existing site’s unavailable `astro/tsconfigs/base` and built the JavaScript Worker successfully.

```sh
node /home/tiki/.npm/_npx/c943b712072b77c4/node_modules/wrangler/bin/wrangler.js deploy \
  --config ./wrangler.toml --name doesitarm-scanner-preview
```

## Verification

- **Rust and Wasm.** All 21 Rust tests and the Rust format check passed. Build A’s 72 native/Wasm comparisons and callback-error checks passed against the regenerated Wasm.
- **Worker.** Seven Node tests exercised success and partial JSON parity, redirect validation, private and mixed DNS answers, streaming body rejection, ETag changes, budgets, deadlines, request caps, rate limiting, and concurrent requests. The tests ran without Wrangler dev or Miniflare.
- **Chromium 155.0.8059.84.** All five end-to-end cases passed in a single headless Chromium instance. The file picker produced identical JSON to the CLI for all 12 Build A fixtures. Chromium’s folder picker and file-system drop covered XML and binary plists, and both chose the declared executable ahead of a second executable in the same folder. Folder metadata was compared with the native ZIP scan, and slice details with the native scan of the extracted executable. Chromium also exercised direct URL ranges, CORS and HTTP 200 fallback, a simulated Cloudflare resource limit, and Worker rescan from the Homebrew table at a 375 px viewport.
- **Sparse run.** The picker scanned 12 paths to a sparse 5 GiB Mach-O. Each path was a hard link to the same inode, which occupied 8 KiB on disk. Each scan read under 1 KiB, verified a slice beyond 4 GiB, and matched the CLI JSON. The batch took 273 ms, including CLI comparisons. Combined Chromium proportional set size rose from 327 MiB to a sampled peak of 334 MiB.
- **Browser coverage.** Safari, real Firefox, and macOS Finder package drops were untested. The Chromium test used actual file paths for the directory drop. When the browser cannot expose a macOS package as a directory, use the folder picker or a ZIP of the app.

## Behavior and limits

Local scans run in dedicated module workers, with up to four active jobs according to `navigator.hardwareConcurrency`. Folder scans count `Contents/Info.plist` and the executable as the input size. The displayed read percentage measures cumulative source bytes and can exceed 100% if ranges overlap. The browser uses a 12-second direct network deadline. CORS and invalid range responses trigger a Cloudflare scan. Browsers need access to the origin’s `Content-Range` header. The Cloudflare scan shows indeterminate progress until its JSON arrives.

`GET /api/scan?url=<HTTPS URL>&budget=<bytes>` defaults to 8 MiB, clamps at 64 MiB, and uses the CLI’s one-byte size probe and budget accounting. The Worker validates every redirect, checks A and AAAA answers for public addresses, and uses Cloudflare’s public fetch routing. The DNS precheck cannot pin the address used by Cloudflare’s independent resolver. Uploads, private-network bindings, KV, custom routes, and custom domains are outside this deployment.

The Worker enforces a 20-second network deadline, 36 outbound subrequests including DNS and redirects, six followed redirects, and one active Wasm scan per isolate. Its per-IP rate limit is 12 requests per 60 seconds per Cloudflare location. Wasm linear memory is capped at 80 MiB to leave space under Cloudflare’s 128 MB isolate limit. Upstream range bodies are streamed into bounded buffers. Application limits can return partial evidence. If the platform itself ends the invocation with error 1102, the client recognizes it as a CPU or memory limit and Cloudflare supplies the HTTP error response. Live CPU and memory caps were untested. [Cloudflare runtime limits](https://developers.cloudflare.com/workers/platform/limits/)

## Commits

- `b0752dd` adds a small plist metadata wrapper to `scan-core` and exports it from `scan-wasm`. It reuses Build A’s plist parser and changes no archive or Mach-O scanning behavior.
- `902ad9c` adds the build, Worker range API, and Node tests.
- `e787863` adds the browser app, Homebrew comparison, and Chromium tests.

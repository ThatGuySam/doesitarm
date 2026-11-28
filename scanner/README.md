# Does It ARM scanner

Inspect a local macOS download or a public HTTPS artifact. The scanner reads the app’s `Info.plist` and the Mach-O headers of its declared main executable. It works on Linux without mounting images or running installer code.

## Build and use the CLI

From `scanner/` with Rust 1.99.1 on `PATH`:

```sh
cargo build --locked -j2 -p scan-cli
target/debug/scan-cli scan fixtures/hfsx.dmg --json
target/debug/scan-cli scan /path/to/YourApp.zip --profile local --json
target/debug/scan-cli scan 'https://example.com/YourApp.dmg' --budget 8388608 --json
```

CLI files default to the unmetered local profile. URLs default to the remote-cli profile with 8, 64, and 256 MiB attempt tiers. The CLI exits with 0 after a complete scan, 1 when the scan returns partial evidence or an error, and 2 for invalid arguments. `--json` emits the result even on exit 1. [Safety profiles and CLI flags](PROFILES.md)

URL scans start with `Range: bytes=0-0` to discover the total size. Every subsequent request has an inclusive absolute start and end. The CLI follows HTTPS redirects and validates HTTP 206, `Content-Range`, the total, the returned byte count and a strong ETag when available. The byte budget includes the discovery byte and repeated ranges.

`--allow-stream` accepts an HTTP 200 from the discovery probe and reads one response up to the budget. It reuses already delivered ranges from an anonymous temporary file. `--request-delay-ms` sets the minimum interval between range request starts. `--allow-http` enables plain HTTP sources and redirects for catalog URLs that require them.

`--bundle-path "Example.app"` selects a registered bundle from a container with multiple candidates. `--binary-path "bin/example"` scans an exact standalone executable and reports its architecture and macOS deployment target. The Homebrew runner supplies these paths from artifact declarations. [Campaign and resume instructions](CLIMB.md)

## Build Wasm and check parity

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --locked --version 0.2.130 -j2
cargo test --locked -j2
cargo build --locked -j2 -p scan-cli
cargo build --locked -j2 -p scan-wasm --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/scan_wasm.wasm
node scripts/verify-wasm.mjs
```

The Node script checks identical JSON for local fixture reads in the CLI and Wasm. It exercises synchronous and asynchronous callbacks, both budgets, nested plists, unsafe sizes, and callback errors. Regenerate the fixtures with `python3 fixtures/generate.py`.

The Wasm function `scan(totalSize, byteBudget, readAt, decodedByteBudget?, profile?, expired?)` returns a promise for a JSON string. Pass sizes and budgets as BigInts. The source size must be at most `2^53 − 1`. The default Worker profile has a 64 MiB decoded-byte budget. Local callers select the local profile explicitly. The callback receives a BigInt offset and a Number length and returns a `Uint8Array` or a promise for one. For a browser file, the host can provide Blob slices in a worker.

```js
import init, { scan } from './pkg/scan_wasm.js';

await init();
const result = JSON.parse(await scan(BigInt(file.size), 0n, async (offset, length) => {
  const start = Number(offset);
  if (!Number.isSafeInteger(start + length)) throw new RangeError('File offset');
  const bytes = await file.slice(start, start + length).arrayBuffer();
  return new Uint8Array(bytes);
}, undefined, 'local'));
```

The same callback can use `FileReaderSync` in a worker or await a validated fetch range. Browser fetches also require permission from the download origin through CORS.

## Scan installed audio plug-ins

On Does It ARM, open `/apple-silicon-app-test?scanner=next` for the preview app scanner or `/plugin-scanner/?scanner=next` for the dedicated plug-in scanner and test kit. The choice is saved in local storage on that origin. An unflagged visit on either page reopens the preview after opt-in. Open either page with `?scanner=stable` to clear the preference. The standard app test and the existing `?v=3` route are available through their original URLs after clearing it.

For site development, run `pnpm build:scanner-next` from the repo root with Rust and wasm-bindgen set up as above, then start Astro. Cloudflare's frontend build packages these browser assets into `static/scanner-next/`. The existing `SCANNER_V3` service still serves `?v=3` and backs the download URL API used by the app preview.

Open **Scan audio plug-ins** on the browser scanner. In Finder, open **Go to Folder** with Shift–Command–G. Start with `/Library/Audio/Plug-Ins/Components` or `~/Library/Audio/Plug-Ins/Components` for Audio Units, then drag that folder onto the scanner. For VST2, VST3 or CLAP, drag the corresponding `VST`, `VST3` or `CLAP` subfolder from either `Audio/Plug-Ins` location. For AAX, use `/Library/Application Support/Avid/Audio/Plug-Ins`. **Choose folder** works where the browser exposes the directory picker and grants access.

The browser reports the submitted roots it could scan, read in part or had to skip. Each plug-in row describes the executable named by `CFBundleExecutable` in `Contents/MacOS`. It uses bundle metadata, AU component declarations and optional VST3 module info. The verdict describes verified executable slices. DAW loading, licensing and session recall require a host check. Use the CSV or JSON plug-in export to share those results without paths. JSON also includes available AU and VST3 identities. [MCP connector design](PLUGIN-MCP.md)

## Read the results

- `architectures` describes the declared main executable. Each slice reports its CPU type and subtype, offset and size, deployment target, and code-signature load-command presence.
- On a budget-limited scan, a fat-table entry can have `header_verified: false`. A verified header indicates that the scanner reached the thin slice. The signature field records only the presence of the load command.
- Top-level `min_macos` prefers the bundle’s `LSMinimumSystemVersion`. If missing, it reports the lowest deployment target read from any Mach-O slice. Use the per-slice values for processor-specific requirements.
- `candidate_executables` can appear when a sequential archive exposes plausible binaries before its plist. `installer` contains flat package declarations such as `hostArchitectures`. Both provide evidence before the plist identifies the main executable.
- `bytes_read` counts unique bytes from complete range responses. `bytes_requested` sums the lengths of attempted requests, including repeats and failures. `reads` counts those attempts. Range metrics include the one-byte size probe. CLI stream fallback reports physical bytes received from its single response. `total_size` is the original artifact size or 0 if discovery failed.
- `decoded_bytes` counts decompression work, including skipped output in sequential streams and the declared output reserved before decoding a whole chunk. The count includes UDIF zero-filled reads. The Worker enforces a total decoded-byte budget. Decode limits return `limit_reached` with the reason and the evidence collected so far.

See the supported formats, hardening measurements, and original benchmark. [Handoff](HANDOFF.md) · [Hardening](HARDENING.md) · [Homebrew run 1](results/homebrew-run-1.md)

# Does It ARM scanner

Inspect a local macOS download or a public HTTPS artifact. The scanner reads the app’s `Info.plist` and the Mach-O headers of its declared main executable. It works on Linux without mounting images or running installer code.

## Build and use the CLI

From `scanner/` with Rust 1.99.1 on `PATH`:

```sh
cargo build --locked -j2 -p scan-cli
target/debug/scan-cli scan fixtures/hfsx.dmg --json
target/debug/scan-cli scan /path/to/YourApp.zip --budget 8388608 --json
target/debug/scan-cli scan 'https://example.com/YourApp.dmg' --budget 8388608 --json
```

The default budget is 64 MiB. The CLI exits with 0 after a complete scan, 1 when the scan returns partial evidence or an error, and 2 for invalid arguments. `--json` emits the result even on exit 1.

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

The Node script checks identical JSON for local fixture reads in the CLI and Wasm. It exercises both synchronous and asynchronous callbacks, multiple budgets, and rejected or malformed callback results. Regenerate the fixtures with `python3 fixtures/generate.py`.

The Wasm function accepts a `bigint` size and budget, and a callback `readAt(offset: bigint, length: number)` that returns a `Uint8Array` or a promise for one. The result is a promise for a JSON string. For a browser file, the host can provide Blob slices in a worker.

```js
import init, { scan } from './pkg/scan_wasm.js';

await init();
const result = JSON.parse(await scan(BigInt(file.size), 8_388_608n, async (offset, length) => {
  const start = Number(offset);
  if (!Number.isSafeInteger(start + length)) throw new RangeError('File offset');
  const bytes = await file.slice(start, start + length).arrayBuffer();
  return new Uint8Array(bytes);
}));
```

The same callback can use `FileReaderSync` in a worker or await a validated fetch range. Browser fetches also require permission from the download origin through CORS.

## Read the results

- `architectures` describes the declared main executable. Each slice reports its CPU type and subtype, offset and size, deployment target, and code-signature load-command presence.
- On a budget-limited scan, a fat-table entry can have `header_verified: false`. A verified header indicates that the scanner reached the thin slice. The signature field records only the presence of the load command.
- Top-level `min_macos` prefers the bundle’s `LSMinimumSystemVersion`. If missing, it reports the lowest deployment target read from any Mach-O slice. Use the per-slice values for processor-specific requirements.
- `candidate_executables` can appear when a sequential archive exposes plausible binaries before its plist. `installer` contains flat package declarations such as `hostArchitectures`. Both provide evidence before the plist identifies the main executable.
- `bytes_read` counts bytes accepted from the underlying source, including repeated ranges. `reads` counts attempted source reads. `total_size` is the original artifact size or 0 if discovery failed. CLI URL metrics include the size probe.

See the supported format details and the measured range scan in the [handoff](HANDOFF.md) and [Homebrew summary](results/homebrew-run-1.md).

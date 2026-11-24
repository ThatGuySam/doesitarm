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

The CLI defaults to 64 MiB each for requested bytes and decoded bytes. Set them independently with `--budget BYTES` and `--decoded-budget BYTES`. The CLI exits with 0 after a complete scan, 1 when the scan returns partial evidence or an error, and 2 for invalid arguments. `--json` emits the result even on exit 1.

URL scans start with `Range: bytes=0-0` to discover the total size. Every subsequent request has an inclusive absolute start and end. The CLI follows HTTPS redirects and validates HTTP 206, `Content-Range`, the total, the returned byte count and a strong ETag when available. It caps the retrieval budget below the known artifact size for files larger than the discovery byte.

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

The Wasm function `scan(totalSize, byteBudget, readAt, decodedByteBudget?)` returns a promise for a JSON string. Pass sizes and budgets as BigInts. The source size must be at most `2^53 − 1`. The decoded-byte budget defaults to 64 MiB. The callback receives a BigInt offset and a Number length and returns a `Uint8Array` or a promise for one. For a browser file, the host can provide Blob slices in a worker.

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
- `bytes_read` counts unique bytes from complete range responses. `bytes_requested` sums the lengths of attempted requests, including repeats and failures. `reads` counts those attempts. CLI URL metrics include the one-byte size probe. `total_size` is the original artifact size or 0 if discovery failed.
- `decoded_bytes` counts decompression work, including skipped output in sequential streams and the declared output reserved before decoding a whole chunk. UDIF zero-filled reads also use this budget. Decode limits return `limit_reached` with the reason and the evidence collected so far.

See the supported formats, hardening measurements, and original benchmark. [Handoff](HANDOFF.md) · [Hardening](HARDENING.md) · [Homebrew run 1](results/homebrew-run-1.md)

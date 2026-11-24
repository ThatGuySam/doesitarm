# Scanner safety profiles

| Profile | Default host | Source byte budget | Decoded work and time |
| --- | --- | --- | --- |
| `local` | Browser files and folders, CLI files | Unmetered | No decoded-byte cap, expansion-ratio cap, or default deadline |
| `remote-cli` | CLI URLs and direct browser URLs | 8, 64, then 256 MiB per attempt | No decoded-byte cap, expansion-ratio cap, or default scan deadline |
| `worker` | Cloudflare `/api/scan` | 8 MiB by default, including discovery and repeated ranges | 64 MiB decoded, 20 s wall time, and 5,000 ms platform CPU time |

All profiles validate container ranges and offset arithmetic. The same plist nesting limit applies to local and remote inputs. Plist, archive, and filesystem metadata retain structural bounds for tables, object counts, and individual buffers. XZ and LZMA dictionaries have a 32 MiB decoder memory ceiling. Where possible, buffers for decompressed data grow in steps as the codec produces bytes. Large compressed containers nested inside ZIP can be scanned on a local device by replaying the decoder when their inner parser seeks backward.

The Worker also retains the whole-chunk ratio of 32,768 to 1, the stream ratio of 1,024 to 1 with 64 KiB of slack, the 4 GiB compressed traversal ceiling, and the hardening operation counters. Core checks the deadline at source reads, decoder steps, and filesystem work checkpoints. The Worker races the scan against a wall timer, aborts outstanding I/O, and replaces the Wasm instance after a timeout or trap. Cloudflare applies the CPU ceiling when synchronous Wasm code keeps the event loop from running the timer. The Worker caps Wasm linear memory at 80 MiB and external subrequests at 36, including DNS and redirects. The browser build uses the standard Wasm memory configuration. [Original hardening defaults](HARDENING.md) · [Cloudflare configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#limits)

## CLI

```sh
scan-cli scan ./YourApp.zip --profile local --json
scan-cli scan 'https://example.com/YourApp.dmg' --profile remote-cli --json
scan-cli scan ./YourApp.zip --profile worker --budget 8388608 --decoded-budget 67108864 --json
```

The CLI selects the first two profiles automatically by input type. URL attempts advance to the next tier on byte-budget exhaustion. `--budget BYTES` selects one attempt. Each retry starts a fresh scan and the JSON describes the final attempt. The sum of transfer budgets across all three attempts is 328 MiB. `--allow-stream` enables a bounded temporary spool for origins that return HTTP 200 to range discovery. The CLI retains a 15-second timeout per HTTP request. Use `--deadline-ms MS` to impose a cooperative deadline on the scan, including all retries. A Worker-profile CLI scan allows up to 20 seconds. `--decoded-budget` configures the Worker profile. The local profile ignores byte and decoded budget values.

## Browser and Wasm

Direct URL scans use CORS range reads and the same 8/64/256 MiB ladder up to the selected tier. Cloudflare handles fallback when the origin cannot supply usable CORS ranges. Browser file, directory, direct URL, and API calls have no timer in the browser. The Cloudflare API retains its own deadline.

```ts
scan(totalSize, byteBudget, readAt, decodedByteBudget?, profile?, expired?)
scan_target(totalSize, byteBudget, readAt, kind, path, decodedByteBudget?, profile?)
```

Use BigInts for source size and budgets. The read callback receives a BigInt offset and a Number length. Pass `'local'` with any valid byte budget, such as `0n`, for file-backed reads. The default profile for calls that omit the profile argument is `worker` for compatibility with the earlier bounded API. The optional `expired` callback returns true when a host deadline has elapsed. The automatic Worker deadline also applies to targeted scans. Rust callers use `ScanLimits::for_profile` and can supply their own cooperative deadline with `scan_target_with_deadline`.

## Cloudflare API

Send `Sec-Fetch-Site: same-origin` or `X-Scan-Client: browser` to `GET /api/scan`. The UI sends the latter. `SCAN_MAX_BUDGET` configures the maximum in bytes, with an 8 MiB default. Omitting the budget requests up to 8 MiB, subject to that cap. Worker range scans also keep the transfer below the artifact size where possible. The API rate-limits by IPv4 address or IPv6 /64, and busy responses leave the caller’s rate-limit token available.

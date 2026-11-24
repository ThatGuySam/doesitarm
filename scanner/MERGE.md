# Scanner merge

November 24, 2026. Merged `scanner-climb` commit `78a9309` into `scanner-wasm` at `c440d31`. Its first parent, `3158ae1`, already included `scanner-harden`. Commit `67057eb` adds profiles and the Worker fixes.

## Conflict resolution

- The CLI kept target selection, stream fallback, HTTPS range validation, and the request budget ladder. Discovery and repeated ranges count toward transfer, and results distinguish unique accepted bytes from attempted lengths. Stream fallback accounts for physical bytes delivered into its temporary spool.
- ZIP, tar, XAR, PBZX, and UDIF share the per-scan decoded-work meter on Worker. The merged parsers keep the added codecs, BOM-directed late plist recovery, nested installers, and partial evidence. Plist depth and binary reference checks, UDIF overlap checks, and checked source ranges also apply to nested readers.
- Wasm kept exact BigInt size validation, JavaScript-safe output sizes, both callback modes, direct bundle metadata, and declared bundle and executable targets. The original Rust test inventory was 29 tests on harden and 31 on climb. The merge retains all 39 distinct tests.

## Profiles and Worker fixes

`local` is the browser file and CLI file default. It has structural checks and removes the request budget, decoded-byte budget, expansion-ratio policy, and default deadline. Direct CORS ranges and CLI URLs use `remote-cli` with 8, 64, and 256 MiB attempts. Cloudflare uses `worker` with an 8 MiB network default, a 64 MiB decoded budget, a 20 s wall deadline, and the hardening ratio and work counters. The Worker Wasm build has its own 80 MiB linear-memory ceiling. [Profiles and API](PROFILES.md)

The Worker races each scan against a hard wall timer and releases the isolate’s busy slot when either result settles. A timeout or Wasm trap discards the active instance, and the next scan starts in fresh Wasm memory. CPU enforcement is configured at 5,000 ms, with 36 subrequests. Busy requests skip rate-limit charging, and IPv6 clients share a /64 key. The API requires a same-origin fetch or the scanner client header, clamps anonymous transfer to the configured boundary, and sends a generic error for unusable upstream ranges with upstream status and ETag excluded.

## Verification

- `cargo fmt --all --check`, `cargo test --locked -j2` (41 tests), and Clippy with `-D warnings` passed for native targets and `wasm32-unknown-unknown`.
- The Web build and `node scripts/verify-wasm.mjs` passed 190 native/Wasm comparisons and the BigInt, plist, callback, and profile cases. The Wasm checks include a tarball with over 64 MiB of decoded output and a ZIP containing a DMG over 32 MiB. Both complete in `local` and stop at the applicable Worker limit.
- All six Python runner tests and 14 Node Worker tests passed. The Worker tests cover timer recovery, trap recovery, independent Wasm memories, the budget boundary, origin admission, IPv6 rate limiting, busy handling, generic upstream errors, and deployment configuration.
- All five browser flows passed in one headless `/usr/bin/chromium` instance. The cases exercise file and folder picking, sparse 5 GiB Mach-O inputs, direct and fallback URL scans, and the Homebrew comparison table.

## Homebrew replay

The release CLI scanned all 100 pinned regression artifacts using the original URL and target declarations. The replay used one 8 MiB attempt per declared target, with stream fallback enabled and a 40 ms delay between range requests. Every artifact in the 78-cask low-cost subset had also used that tier for its final CLIMB result. The other 22 were replayed at the first tier to keep transfer bounded. [CLIMB baseline](CLIMB.md) · [78-cask replay](target/merge-regression/live/run.json) · [Remaining 22](target/merge-regression/first-tier/run.json)

| Cohort and comparison | CLIMB apps | Replay apps | CLIMB executables | Replay executables |
| --- | ---: | ---: | ---: | ---: |
| All 100 at 8 MiB | 62 | 62 | 7 | 7 |
| 78 casks at their recorded final tier | 62 | 62 | 7 | 7 |
| CLIMB’s full ladder across all 100 | 77 | — | 8 | — |

All 69 verified outcomes from the comparable runs remained verified. All 57 verified outputs with matching strong ETags agreed on format, size, bundle identifier, version, minimum macOS, and architecture records. `dockfix` and `spotify-soloist` served different representations. `network-weather` changed from an upstream HTTP 500 to budget exhaustion. Zoom reached the same BOM-verified late plist with 965,581 bytes requested and 900,034 unique bytes accepted. Across the 100 casks, the CLI requested 317,243,426 bytes in 1,316 reads.

The replay’s release binary had SHA-256 `cba8cfca02638de31f8de75f9fbf78eed062f8a305462ce3fd611fcd22e22885`. The final build shares parent paths among pending XAR components to keep their allocation proportional to parsed metadata. Its release binary had SHA-256 `431e39ceb026042fdc97775a2fe2b059058c240932759061dff3d77407ddff53`. It reproduced the Zoom result and verified DisplayLink with automatic CLI escalation, reporting 10,932,728 requested bytes on its final attempt. Both matched their recorded strong ETags. [Final build spot checks](target/merge-regression/final-spots/)

## Remaining verification

The full-cohort replay covers the first tier. The 64 and 256 MiB results for the entire cohort remain from CLIMB. Production enforcement of the Cloudflare CPU and subrequest settings remains unmeasured. The configuration and handler were verified locally. No Wrangler invocation, deployment, or push occurred.

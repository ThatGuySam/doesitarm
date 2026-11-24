# Scanner hardening

November 24, 2026. This pass addresses the six defects in the independent QA-A report against `b0752dd`.

## Fixes and regression coverage

| Defect | Fix | Regression coverage |
| --- | --- | --- |
| D1 | Read plist events with a collection-depth guard before building values. Apply it to Info.plist and the UDIF index. Validate binary object and collection counts ahead of the parser's allocations. | Rust tests exercise XML and binary Info.plist and an XML UDIF index. The Node verifier checks direct bundle metadata and requires the nested-index scan promise to settle with `invalid`. |
| D2 | Reserve whole-chunk output before decoding UDIF. Validate stored ranges for overlap. Cache hits reuse an already charged chunk. An eviction releases memory before the next decode. | Each of ADC, zlib, bzip2, LZFSE, and XZ-framed LZMA is tested with both sufficient and insufficient credit. A highly compressed, valid bzip2 block exercises the ratio ceiling from below. The original bzip2 and zlib amplification cases exercise stored-range rejection. |
| D3 | Use the same output budget for ZIP DEFLATE, tar and PKG gzip, XAR zlib, and PBZX XZ. Decoder skips and output share the budget. Work-limit errors preserve the observations already collected. | Fixture tests lower the shared budget one byte below the full scan and check the reason and partial evidence. The Node verifier also exercises a zero decoded budget. The original gzip and distant ZIP slice cases exercise the default cap. |
| D4 | Check the exact BigInt size before Wasm reads. Reject source sizes and serialized embedded sizes and offsets above `2^53 − 1`. Callback offsets are BigInts. | Node checks the safe boundary, the first unsafe integer, negative sizes, and values that would wrap a Wasm `u64`. |
| D5 | Document the CLI's actual defaults, the Wasm build and generated glue, format limits, and the historical benchmark's revision and accounting. | The verifier checks CLI help for the two defaults and runs parity against regenerated glue. |
| D6 | Count each accepted source byte once and publish the sum of attempted range lengths separately. Charge the request budget for every attempted range. | The fat-fixture regression catches the repeated magic probe. Node independently merges callback ranges, sums requested bytes, and checks accounting on source errors. |

## Defaults and remaining limits

- The decoded budget defaults to 64 MiB per scan. Callers can tune it independently of the request budget through `ScanLimits`, `--decoded-budget`, or the fourth Wasm argument. It bounds the amount of output processed on a Worker request and allows normal metadata reads and nearby Mach-O slices. A known skip that would cross the remaining budget stops before decoding it. A far slice can still leave valid fat-table evidence.
- Whole chunks have an expansion limit of 32,768 to 1. The Homebrew images include Firefox XZ chunks near 3,745 to 1 and Slack bzip2 chunks near 23,302 to 1. Whole chunks are screened against declared lengths and checked against actual consumption. Streams enforce 1,024 to 1 against consumed input at each output step of at most 16 KiB, with 64 KiB of slack for codec buffering. Zero-filled UDIF reads spend output credit. Stored reads use the request budget. Whole-chunk accounting includes reservations if decoding later fails.
- Each scan allows 512 decoder starts, 8,192 source reads, and 8,192 UDIF run visits, including cached and zero-filled visits. The CLI performs one additional discovery request for HTTPS. APFS allows a total of 4,096 B-tree node visits and 262,144 advertised records across its object maps and filesystem trees. The limits cover work that may generate little output or use cached ranges.
- Info.plist payloads have a 2 MiB input cap and the UDIF index has an 8 MiB cap. A plist can have 64 nested collections, 131,072 events or binary references, and 16 MiB of cumulative emitted scalar content. Shared binary objects spend credit when visited repeatedly. Binary collection lengths must fit in the supplied object region before the dependency allocates their reference vectors.
- ZIP directories, Mach-O tables, tar and CPIO names and headers, XAR XML, and filesystem geometry retain their format-specific bounds. DEFLATE, gzip, and PBZX retain a 4 GiB logical traversal limit even with a larger decoded budget. XZ has a 32 MiB decoder memory limit. PBZX can skip whole untouched chunks by their length headers. Decoded bytes and operation counts are proxies for CPU time. Worker scheduling, host I/O deadlines, and dependency runtime costs remain outside those counters. [Format limits](HANDOFF.md#limits-and-next-steps)

## Verification on Linux and Node

- Rust 1.99.1 passed 29 tests with `cargo test --locked -j2`. Clippy with `-D warnings` passed for native targets and `wasm32-unknown-unknown`. Node 26.13.0 passed 96 native/Wasm JSON comparisons across 12 fixtures, four budget settings, and two callback modes. It also passed the JavaScript boundary, plist, command help, and callback checks. The generated Wasm at `fb587a2` was 1,193,986 bytes. [Build and verification commands](HANDOFF.md#verification-and-reproduction)
- Replayed the 17 inputs from QA-A's `gen.py` and `gen2.py`, plus the 20,000- and 540,000-level UDIF indexes from the report. Every native invocation exited with code 1 and structured JSON under `timeout 12s` and `ulimit -v 1000000`. The longest case took about 4 ms including CLI startup. The measured peak RSS was 13 MiB. Under `timeout 12s`, `ulimit -v 2000000`, and Node's `--disable-wasm-trap-handler`, all 19 Wasm scans settled. The longest scan took 16 ms, and the Node batch including initialization took 0.23 s with about 100 MiB peak RSS. A separate run settled all 30 concurrent scans of the 20,000-level index with `invalid`, then completed a valid ZIP in the same instance.
- The QA mutation harness ran with overflow checks and debug assertions under `timeout 30s` and `ulimit -v 2000000` for each batch. With seed `20261124`, the 12 scanner fixtures and two RAW-wrapped disk images produced 88,000 mutations, zero panics, and a slowest reported case of 2 ms.

| QA input | Baseline native time | Hardened outcome | Charged decoded bytes |
| --- | ---: | --- | ---: |
| UDIF bzip2 amplification | 5.252 s | Invalid overlapping stored ranges | 0 |
| UDIF zlib amplification | 1.209 s | Invalid overlapping stored ranges | 0 |
| tar.gz expansion | 2.195 s | Decoded-byte budget reached | 512 |
| ZIP with distant fat slice | 0.340 s | Decoded-byte budget reached, with fat-table evidence | 28 |

## Homebrew benchmark

The baseline `b0752dd` and hardened `fb587a2` release CLIs scanned the same 30 casks with the same 8 MiB request budget. Both runs used catalog SHA-256 `78e2e5fc666464ff8857c5f5bbd58aad901c95381469eb4a249405911d895e72`. URLs, versions, reported artifact sizes, and available ETags matched. The measurements include live HTTPS latency and CLI startup. Benchmark JSON from this worktree is under `target/hardening/before` and `target/hardening/final`. [Benchmark runner](scripts/homebrew-run.py)

| Metric | Baseline | Hardened |
| --- | ---: | ---: |
| Complete scans | 21 | 21 |
| Partial scans | 7 | 7 |
| Source errors | 2 | 2 |
| Range requests attempted | 365 | 343 |
| Baseline accepted bytes and hardened requested bytes | 90,273,187 | 74,336,341 |
| Unique accepted artifact bytes | Unavailable | 74,031,026 |
| Sum of per-cask wall times | 50.329 s | 31.974 s |
| Median per-cask wall time | 0.996 s | 0.661 s |

The hardened run requested 17.7% fewer bytes. It counts the two failed one-byte probes in the requested total. Telegram and iTerm2 stopped at the decoded-byte budget with the same x86-64 header and arm64 fat-table evidence as the baseline. All 30 results matched on architecture records, bundle metadata, candidate executables, and installer metadata. The largest per-cask wall-time increase was 63 ms.

Zoom used the most decoded credit at 35.1 MiB. The 64 MiB default leaves headroom above that observation and cuts the QA bzip2 case's roughly 2 GiB of possible output work by a factor of 32 even before checking its repeated stored ranges. Timings on the deployed Worker remain unmeasured.

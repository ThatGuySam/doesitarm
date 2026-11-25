# Scanner WASM size

The browser baseline was built from `scanner-pages` at `12b3b2c` with the default Cargo release profile and wasm-bindgen 0.2.130. The build in this worktree reproduced the lead’s 24,493,375-byte file and the original SHA-256.

[Pie charts](results/wasm-size-pie.svg) · [Breakdown data](results/wasm-size.json)

## Build measurements

| Checkpoint | Raw bytes | Gzip bytes | Brotli bytes | Cargo wall time | Peak child RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default release | 24,493,375 | 2,557,711 | 1,128,636 | 244.73 s | 4,678,424 KiB |
| Breakdown only | 24,493,375 | 2,557,711 | 1,128,636 | Same artifact | Same artifact |

Sizes measure the browser package after wasm-bindgen. Compression uses gzip level 9 and Brotli quality 11. The build ran with `--locked -j2`. Peak RSS is the largest individual build process's high-water mark from `wait4`. The separate wasm-bindgen stage took 1.86 s and peaked at 1,126,188 KiB.

## Where the bytes went

Code accounts for 19,317,390 bytes of function bodies across 13,004 definitions, plus 25,248 bytes of structure and function length prefixes. The custom name payload adds 4,864,061 bytes. Sections in the chart include their encoded headers.

The baseline contains 184 function symbols that mention `pkg::inspect_payload`, accounting for 3,198,876 body bytes. That includes 92 directly named bodies totaling 3,169,248 bytes. Rust generated them for distinct reader and decoder types and included related glue. The largest code owners are the scanner's Mach-O, package, and streaming bundle modules. Ownership is estimated from the demangled function name. Inlined instructions count toward the function that contains them.

## Reproduce the breakdown

Run this command from `scanner/`.

```sh
node scripts/wasm-size.mjs pkg/scan_wasm_bg.wasm
```

For an artifact stripped of function names, pass `--symbols path/to/named.wasm`. The script checks that both modules are byte-identical after removing their name sections. Pass `--out-dir` to keep reports from multiple builds.

## Real-app replay

The manifest covers 763 recorded Homebrew versions, including 658 historically verified results, plus the pinned edge and corpus entries and available representation variants. Deduplication by token, version, and URL yielded 854 cases for 759 app tokens. It used 11 offline ledger kits and made serial range requests for 843 cases across 842 URLs. The gate also scanned 55 archived or generated fixtures and compared 125 canonical native folder results from the existing 10,000-file generator.

The initial live run took 64.2 minutes of scan time. It returned 629 complete results and 158 transport errors, including origins that ignored range requests and timed out. A matched transport error preserves failure behavior and leaves the app's parser path unverified. Each controlled comparison reuses the same range responses, including errors. The comparison sorts object keys, preserves array order, and excludes timing fields. The baseline used one 256 MiB remote tier for live artifacts, with a 5-second request timeout and an 18-second per-case acquisition budget. Validated read-ahead reduced origin requests after the first 56 cases.

| Checkpoint | Live-origin cases replayed | Kits | Wasm fixtures | Changed or missing | Offline app time | Offline fixture time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original package | 843 | 11 | 55 | 0 | 166.46 s | 0.14 s |

## Verification

The original revision passed 66 Rust tests, 222 native/Wasm comparisons, 56 Node tests, the page resolver replay, 31 generated edge checks, and six Python tests.

Chromium regression, smoke, and element-count checks require a browser. The run used the requested browser-free toolchain.

## Pie chart data

### File sections

| Section | Bytes | Share of file |
| --- | ---: | ---: |
| Code | 19,342,638 | 78.97% |
| Custom: name | 4,864,066 | 19.86% |
| Data | 269,164 | 1.10% |
| Functions | 13,009 | 0.05% |
| Imports | 1,776 | 0.01% |
| Exports | 942 | 0.00% |
| Types | 766 | 0.00% |
| Elements | 696 | 0.00% |
| Custom: target_features | 151 | 0.00% |
| Custom: producers | 114 | 0.00% |
| Globals | 27 | 0.00% |
| Tables | 13 | 0.00% |
| Wasm header | 8 | 0.00% |
| Memory | 5 | 0.00% |

### Code owners

| Owner | Bytes | Share of code | Functions |
| --- | ---: | ---: | ---: |
| scan-core::macho | 4,885,531 | 25.26% | 1,465 |
| scan-core::pkg | 4,270,824 | 22.08% | 306 |
| Rust core/alloc/std | 3,535,279 | 18.28% | 7,911 |
| scan-core::stream_bundle | 2,330,494 | 12.05% | 482 |
| scan-core::apfs | 782,496 | 4.05% | 183 |
| scan-core::hfs | 680,069 | 3.52% | 121 |
| scan-core::diagnostic | 596,847 | 3.09% | 685 |
| scan-core::cpio | 375,827 | 1.94% | 35 |
| scan-core::inflate | 316,231 | 1.63% | 289 |
| scan-core::pbzx | 303,646 | 1.57% | 184 |
| scan-core::nested | 288,820 | 1.49% | 13 |
| scan-core::(root) | 190,378 | 0.98% | 186 |
| lzma-rust2 | 119,140 | 0.62% | 117 |
| scan-core::zip | 74,749 | 0.39% | 27 |
| sevenz-rust2 | 56,715 | 0.29% | 62 |
| Unclassified symbols | 54,213 | 0.28% | 187 |
| roxmltree | 48,780 | 0.25% | 49 |
| scan-core::tar | 45,687 | 0.24% | 20 |
| scan-core::dmg | 44,167 | 0.23% | 30 |
| scan-core::inventory | 38,396 | 0.20% | 188 |
| scan-core::sevenz | 37,726 | 0.20% | 14 |
| plist | 35,728 | 0.18% | 47 |
| libbz2-rs-sys | 29,961 | 0.15% | 11 |
| ruzstd | 28,089 | 0.15% | 35 |
| zlib-rs | 24,623 | 0.13% | 20 |
| lzfse-rust | 16,918 | 0.09% | 36 |
| serde-json | 12,495 | 0.06% | 29 |
| js-sys | 12,347 | 0.06% | 64 |
| time | 11,217 | 0.06% | 7 |
| sha2 | 8,317 | 0.04% | 1 |
| scan-core::bundle | 7,609 | 0.04% | 12 |
| scan-core::decode | 7,432 | 0.04% | 12 |
| dlmalloc | 7,408 | 0.04% | 7 |
| scan-core::local_bundle | 7,316 | 0.04% | 3 |
| scan-wasm | 6,912 | 0.04% | 8 |
| unicode-normalization | 6,556 | 0.03% | 9 |
| hashbrown | 5,797 | 0.03% | 10 |
| scan-core::launcher | 5,283 | 0.03% | 3 |
| base64 | 3,936 | 0.02% | 2 |
| scan-core::bom | 3,821 | 0.02% | 7 |
| wasm-bindgen | 3,728 | 0.02% | 64 |
| scan-core::udif_codec | 3,042 | 0.02% | 3 |
| scan-core::plist_value | 2,458 | 0.01% | 2 |
| scan-core::gzip_tail | 2,223 | 0.01% | 2 |
| zmij | 1,809 | 0.01% | 1 |
| bzip2 | 1,799 | 0.01% | 13 |
| flate2 | 1,508 | 0.01% | 10 |
| crc32fast | 1,498 | 0.01% | 2 |
| indexmap | 1,475 | 0.01% | 2 |
| --rustc | 1,265 | 0.01% | 14 |
| tinyvec | 1,143 | 0.01% | 3 |
| compiler-builtins | 1,035 | 0.01% | 1 |
| memchr | 603 | 0.00% | 1 |
| twox-hash | 600 | 0.00% | 1 |
| itoa | 449 | 0.00% | 2 |
| wasm-bindgen glue | 216 | 0.00% | 6 |
| Code section header | 7 | 0.00% | 0 |

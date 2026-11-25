# Scanner WASM size

The browser baseline was built from `scanner-pages` at `12b3b2c` with the default Cargo release profile and wasm-bindgen 0.2.130. The build in this worktree reproduced the lead’s 24,493,375-byte file and the original SHA-256.

[Pie charts](results/wasm-size-pie.svg) · [Breakdown data](results/wasm-size.json)

## Build measurements

| Checkpoint | Raw bytes | Gzip bytes | Brotli bytes | Cargo wall time | Peak child RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default release | 24,493,375 | 2,557,711 | 1,128,636 | 244.73 s | 4,678,424 KiB |
| Breakdown only | 24,493,375 | 2,557,711 | 1,128,636 | Same artifact | Same artifact |
| Wasm release and shipped name strip | 6,633,612 | 961,908 | 611,119 | 122.03 s | 2,312,360 KiB |

Sizes measure the browser package after wasm-bindgen. Compression uses gzip level 9 and Brotli quality 11. The build ran with `--locked -j2`. Peak RSS is the largest individual build process's high-water mark from `wait4`. The separate wasm-bindgen stage took 1.86 s and peaked at 1,126,188 KiB.

## Build tuning

The browser and Worker use a dedicated profile with `opt-level = "z"`, fat LTO, one codegen unit, and panic abort. The native CLI uses the default release profile at opt-level 3. The native baseline release build took 672.37 s with 4,447,956 KiB peak child RSS. The configured production packaging command took 197.82 s with 2,496,436 KiB peak child RSS after the profile trials warmed the target cache.

| Cumulative change | Raw bytes | Gzip bytes | Brotli bytes | Measured stage | Wall time | Peak child RSS |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Default opt-level 3 | 24,493,375 | 2,557,711 | 1,128,636 | Cargo | 244.73 s | 4,678,424 KiB |
| 3, strip shipped name section | 19,629,309 | 2,376,226 | 1,020,251 | Name strip | 0.22 s | 113,268 KiB |
| s, strip shipped name section | 15,967,421 | 2,257,359 | 918,418 | Cargo | 249.88 s | 3,820,532 KiB |
| z, strip shipped name section | 13,042,774 | 1,484,957 | 789,347 | Cargo | 198.74 s | 3,241,584 KiB |
| z + fat LTO | 12,066,125 | 1,291,887 | 681,913 | Cargo | 204.73 s | 3,418,140 KiB |
| Add one codegen unit | 6,634,943 | 962,370 | 611,936 | Cargo | 128.02 s | 2,317,360 KiB |
| Add panic abort | 6,633,612 | 961,908 | 611,119 | Cargo | 122.03 s | 2,312,360 KiB |
| Add Cargo strip symbols | 6,632,613 | 961,809 | 610,088 | Cargo | 142.82 s | 2,308,992 KiB |
| Panic abort build + Binaryen | 6,449,270 | 1,415,877 | 792,488 | Binaryen | 226.44 s | 459,584 KiB |

Stripping just the shipped name section saved 4,864,066 raw bytes. The selected profile and name strip saved 17,859,763 raw bytes and 1,595,803 gzip bytes in total. Cargo's symbol strip removed `target_features` before wasm-bindgen and lost the names needed for attribution. The shipping step strips names from the final bound file and saves named binaries under `target/wasm-symbols/browser/` and `target/wasm-symbols/worker/`.

The tuned artifact took 208.84 s on the offline app replay, up from 166.46 s. The replay omits publisher latency and includes local reads of the captured responses.

Binaryen 132's `-Oz` saved 184,342 raw bytes with respect to the selected profile. It added 453,969 gzip bytes and 226.44 seconds of build time, so the shipping build uses the smaller transfer artifact. The raw artifact still exceeds 6 MB after this checkpoint.

## Where the bytes went

Code accounts for 19,317,390 bytes of function bodies across 13,004 definitions, plus 25,248 bytes of structure and function length prefixes. The custom name payload adds 4,864,061 bytes. Sections in the chart include their encoded headers.

The baseline contains 184 function symbols that mention `pkg::inspect_payload`, accounting for 3,198,876 body bytes. That includes 92 directly named bodies totaling 3,169,248 bytes. Rust generated them for distinct reader and decoder types and included related glue. The largest code owners are the scanner's Mach-O, package, and streaming bundle modules. Ownership is estimated from the demangled function name. Inlined instructions count toward the function that contains them.

## Reproduce the breakdown

Run this command from `scanner/`.

```sh
node scripts/wasm-size.mjs web/dist/pkg/scan_wasm_bg.wasm \
  --symbols target/wasm-symbols/browser/scan_wasm_bg.wasm
```

For an artifact stripped of function names, pass `--symbols path/to/named.wasm`. The script checks that both modules are byte-identical after removing their name sections. Pass `--out-dir` to keep reports from multiple builds.

## Real-app replay

The manifest covers 763 recorded Homebrew versions, including 658 historically verified results, plus the pinned edge and corpus entries and available representation variants. Deduplication by token, version, and URL yielded 854 cases for 759 app tokens. It used 11 offline ledger kits and made serial range requests for 843 cases across 842 URLs. The gate also scanned 55 archived or generated fixtures and compared 125 canonical native folder results from the existing 10,000-file generator.

The initial live run took 64.2 minutes of scan time. It returned 629 complete results and 158 transport errors, including origins that ignored range requests and timed out. A matched transport error preserves failure behavior and leaves the app's parser path unverified. Each controlled comparison reuses the same range responses, including errors. The comparison sorts object keys, preserves array order, and excludes timing fields. The baseline used one 256 MiB remote tier for live artifacts, with a 5-second request timeout and an 18-second per-case acquisition budget. Validated read-ahead reduced origin requests after the first 56 cases.

| Checkpoint | Live-origin cases replayed | Kits | Wasm fixtures | Changed or missing | Offline app time | Offline fixture time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original package | 843 | 11 | 55 | 0 | 166.46 s | 0.14 s |
| Wasm release and shipped name strip | 843 | 11 | 55 | 0 | 208.84 s | 0.15 s |

## Verification

The original revision passed 66 Rust tests, 222 native/Wasm comparisons, 56 Node tests, the page resolver replay, 31 generated edge checks, and six Python tests.

The tuned browser and Worker package passed all 222 parity comparisons, the 56 Node tests, and the page resolver replay.

Chromium regression, smoke, and element-count checks require a browser. The run used the requested browser-free toolchain.


## Pie chart data

### File sections

| Section | Bytes | Share of file |
| --- | ---: | ---: |
| Code | 6,386,082 | 96.27% |
| Data | 234,628 | 3.54% |
| Functions | 8,623 | 0.13% |
| Imports | 1,776 | 0.03% |
| Exports | 934 | 0.01% |
| Types | 731 | 0.01% |
| Elements | 520 | 0.01% |
| Custom: target_features | 151 | 0.00% |
| Custom: producers | 114 | 0.00% |
| Globals | 27 | 0.00% |
| Tables | 13 | 0.00% |
| Wasm header | 8 | 0.00% |
| Memory | 5 | 0.00% |

### Code owners

| Owner | Bytes | Share of code | Functions |
| --- | ---: | ---: | ---: |
| scan-core::pkg | 1,738,679 | 27.23% | 167 |
| scan-core::macho | 1,535,965 | 24.05% | 736 |
| scan-core::stream_bundle | 798,551 | 12.50% | 219 |
| Rust core/alloc/std | 640,350 | 10.03% | 5,548 |
| scan-core::apfs | 294,672 | 4.61% | 98 |
| scan-core::hfs | 247,804 | 3.88% | 81 |
| scan-core::diagnostic | 172,291 | 2.70% | 362 |
| scan-core::inflate | 146,535 | 2.29% | 149 |
| scan-core::pbzx | 124,423 | 1.95% | 92 |
| scan-core::nested | 115,154 | 1.80% | 7 |
| scan-core::(root) | 113,447 | 1.78% | 224 |
| lzma-rust2 | 52,522 | 0.82% | 93 |
| sevenz-rust2 | 46,849 | 0.73% | 55 |
| plist | 35,763 | 0.56% | 34 |
| scan-core::zip | 33,602 | 0.53% | 21 |
| Unclassified symbols | 33,206 | 0.52% | 101 |
| roxmltree | 23,572 | 0.37% | 71 |
| scan-core::tar | 21,003 | 0.33% | 12 |
| scan-core::inventory | 20,203 | 0.32% | 129 |
| libbz2-rs-sys | 19,983 | 0.31% | 7 |
| ruzstd | 19,029 | 0.30% | 35 |
| scan-core::sevenz | 17,765 | 0.28% | 12 |
| scan-core::dmg | 17,665 | 0.28% | 16 |
| scan-core::udif_codec | 9,105 | 0.14% | 2 |
| zlib-rs | 8,793 | 0.14% | 24 |
| sha2 | 8,193 | 0.13% | 3 |
| dlmalloc | 7,274 | 0.11% | 6 |
| bzip2 | 6,492 | 0.10% | 11 |
| js-sys | 6,150 | 0.10% | 52 |
| lzfse-rust | 5,628 | 0.09% | 14 |
| scan-core::local_bundle | 5,220 | 0.08% | 3 |
| scan-core::launcher | 5,202 | 0.08% | 2 |
| unicode-normalization | 5,172 | 0.08% | 14 |
| hashbrown | 4,480 | 0.07% | 23 |
| scan-core::bundle | 4,399 | 0.07% | 12 |
| scan-core::bom | 4,389 | 0.07% | 7 |
| serde-json | 4,286 | 0.07% | 27 |
| scan-core::plist_value | 3,697 | 0.06% | 2 |
| wasm-bindgen glue | 3,477 | 0.05% | 63 |
| scan-wasm | 3,435 | 0.05% | 4 |
| scan-core::decode | 3,392 | 0.05% | 10 |
| time | 2,968 | 0.05% | 15 |
| quick-xml | 2,543 | 0.04% | 11 |
| memchr | 2,356 | 0.04% | 8 |
| scan-core::cpio | 2,156 | 0.03% | 8 |
| scan-core::gzip_tail | 2,042 | 0.03% | 2 |
| crc32fast | 1,408 | 0.02% | 4 |
| --rustc | 1,189 | 0.02% | 7 |
| tinyvec | 1,063 | 0.02% | 5 |
| zmij | 1,003 | 0.02% | 4 |
| twox-hash | 587 | 0.01% | 2 |
| indexmap | 523 | 0.01% | 1 |
| itoa | 299 | 0.00% | 1 |
| hybrid-array | 88 | 0.00% | 1 |
| equivalent | 33 | 0.00% | 1 |
| Code section header | 7 | 0.00% | 0 |

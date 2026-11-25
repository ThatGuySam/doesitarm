# Scanner WASM size

The shipped browser module is **1,959,784 bytes raw**, **667,433 bytes gzip**, and **477,706 bytes Brotli**. That is 92.0% less raw and 73.9% less gzip than the original, below both size targets.

The browser baseline was built from `scanner-pages` at `12b3b2c` with the default Cargo release profile and wasm-bindgen 0.2.130. The build in this worktree reproduced the lead’s 24,493,375-byte file and the original SHA-256.

[Pie charts](results/wasm-size-pie.svg) · [Breakdown data](results/wasm-size.json)

## Build measurements

| Checkpoint | Raw bytes | Gzip bytes | Brotli bytes | Cargo wall time | Peak child RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default release | 24,493,375 | 2,557,711 | 1,128,636 | 244.73 s | 4,678,424 KiB |
| Breakdown only | 24,493,375 | 2,557,711 | 1,128,636 | Same artifact | Same artifact |
| Wasm release and shipped name strip | 6,633,612 | 961,908 | 611,119 | 122.03 s | 2,312,360 KiB |
| Reader erasure, size-tuned profile | 1,272,345 | 483,286 | 388,349 | 18.90 s | 557,788 KiB |
| Reader erasure, shipping profile | 1,959,784 | 667,433 | 477,706 | 49.11 s | 732,532 KiB |

Sizes measure the browser package after wasm-bindgen. Compression uses gzip level 9 and Brotli quality 11. The build ran with `--locked -j2`. Peak RSS is the largest individual build process's high-water mark from `wait4`. The separate wasm-bindgen stage took 1.86 s and peaked at 1,126,188 KiB.

## Build tuning

The initial browser and Worker tuning used a dedicated profile with `opt-level = "z"`, fat LTO, one codegen unit, and panic abort. The native CLI uses the default release profile at opt-level 3. The native baseline release build took 672.37 s with 4,447,956 KiB peak child RSS. The configured production packaging command took 197.82 s with 2,496,436 KiB peak child RSS after the profile trials warmed the target cache.

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

## Reader erasure

The top-level dispatcher, nested ZIP and 7z entries, HFS and APFS package members, and PKG payload previews enter shared parsers through a borrowed reader. Each asynchronous read forwards to the original reader through a boxed future. The reader also forwards the source size and remaining budget. After the build tuning at `a470a64`, 46 directly named `pkg::inspect_payload` bodies remained. There is now one body of 30,877 bytes and one top-level `inspect` body. The final module has 1,498 functions.

At the same size-tuned settings, reader erasure saved 5,361,267 raw bytes, 478,622 gzip bytes, and 222,770 Brotli bytes. The final shipping profile saves 4,673,828 raw bytes, 294,475 gzip bytes, and 133,413 Brotli bytes relative to the tuned checkpoint before erasure. The offline app batch took 173.56 s after erasure, compared with 208.84 s immediately before it and 166.46 s for the original build. This timing includes local replay I/O and scanner execution. The 125 native folder results also matched exactly. The folder run took 0.432 s, compared with 0.626 s for the original release CLI. The native release rebuild reused compiled dependencies and took 20.56 s with 493,224 KiB peak child RSS.

The browser artifact now has 1,709,585 bytes of code, including 410,250 bytes attributed to Rust core/alloc/std, 220,238 to `scan-core::macho`, and 92,466 to `lzma-rust2`. The production packaging command took 53.39 s with 1,027,896 KiB peak child RSS. The page-resolution Worker artifact is 3,312,236 raw bytes and retains its 80 MiB Wasm memory cap.

7z, XZ/LZMA, bzip2, Zstandard, LZFSE, and plist are reachable from supported local archive, disk image, and bundle formats. The shipped browser uses that local profile for user files, so each decoder stays available.

The smaller `opt-level = z` build was 1,272,345 bytes raw, 483,286 bytes gzip, and 388,349 bytes Brotli. With these reader boundaries, `opt-level = 3` replayed the same cases in 173.15 s in its trial, 20.9% faster than the size-tuned build. The final browser and Worker use that setting with fat LTO, one codegen unit, and panic abort. Both browser artifacts clear both size targets. The nominal profile trials used different levels of build cache reuse, and the offline timings reflect this shared machine's workload.

Binaryen 132 `-Oz` on the reader-erasure build at opt-level z produced 1,222,695 raw bytes, 486,367 gzip bytes, and 391,858 Brotli bytes in 16.37 s. Both compressed outputs grew, so packaging uses the Cargo profile and name stripping.

## Reproduce the breakdown

Run this command from `scanner/`.

```sh
node scripts/wasm-size.mjs web/dist/pkg/scan_wasm_bg.wasm \
  --symbols target/wasm-symbols/browser/scan_wasm_bg.wasm
```

For an artifact stripped of function names, pass `--symbols path/to/named.wasm`. The script checks that both modules are byte-identical after removing their name sections. Pass `--out-dir` to keep reports from multiple builds.

## Real-app replay

The manifest covers 763 recorded Homebrew versions, including 658 historically verified results, plus the pinned edge and corpus entries and available representation variants. Deduplication by token, version, and URL yielded 854 cases for 759 app tokens. It used 11 offline ledger kits and made serial range requests for 843 cases across 842 URLs. The gate also scanned 55 archived or generated fixtures and compared 125 canonical native folder results from the existing 10,000-file generator.

The initial live run took 64.2 minutes of scan time. It returned 629 complete results and 158 transport errors, including origins that ignored range requests and timed out. A matched transport error preserves failure behavior and leaves the app's parser path unverified. Each controlled comparison reuses the same range responses, including errors. Offline ledger kits use the Wasm read callback, which maps recorded host failures to its source errors. The comparison sorts object keys, preserves array order, and excludes timing fields. The baseline used one 256 MiB remote tier for live artifacts, with a 5-second request timeout and an 18-second per-case acquisition budget. Validated read-ahead reduced origin requests after the first 56 cases.

| Checkpoint | Live-origin cases replayed | Kits | Wasm fixtures | Changed or missing | Offline app time | Offline fixture time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original package | 843 | 11 | 55 | 0 | 166.46 s | 0.14 s |
| Wasm release and shipped name strip | 843 | 11 | 55 | 0 | 208.84 s | 0.15 s |
| Reader erasure, size-tuned profile | 843 | 11 | 55 | 0 | 218.93 s | 0.15 s |
| Reader erasure, shipping profile | 843 | 11 | 55 | 0 | 173.56 s | 0.15 s |

## Verification

The original revision passed 66 Rust tests, 222 native/Wasm comparisons, 56 Node tests, the page resolver replay, 31 generated edge checks, and six Python tests.

The tuned browser and Worker package passed all 222 parity comparisons, the 56 Node tests, and the page resolver replay.

The final revision passed 66 Rust tests, 222 native/Wasm comparisons, 56 Node tests, the page resolver replay, 31 generated edge checks, and six Python tests. Rust formatting and scan-core Clippy passed. Workspace Clippy reported 12 diagnostics in untouched page-resolver code. The second production build rebuilt both Wasm variants and reproduced the SHA-256 of the browser package, the Worker package, and the served browser copy. It took 59.41 s with 1,031,632 KiB peak child RSS.

Chromium regression, smoke, and element-count checks require a browser. The run used the requested browser-free toolchain.

## Pie chart data

### File sections

| Section | Bytes | Share of file |
| --- | ---: | ---: |
| Code | 1,709,585 | 87.23% |
| Data | 244,424 | 12.47% |
| Imports | 1,776 | 0.09% |
| Functions | 1,503 | 0.08% |
| Exports | 942 | 0.05% |
| Types | 628 | 0.03% |
| Elements | 608 | 0.03% |
| Custom: target_features | 151 | 0.01% |
| Custom: producers | 114 | 0.01% |
| Globals | 27 | 0.00% |
| Tables | 13 | 0.00% |
| Wasm header | 8 | 0.00% |
| Memory | 5 | 0.00% |

### Code owners

| Owner | Bytes | Share of code | Functions |
| --- | ---: | ---: | ---: |
| Rust core/alloc/std | 410,250 | 24.00% | 755 |
| scan-core::macho | 220,238 | 12.88% | 51 |
| lzma-rust2 | 92,466 | 5.41% | 69 |
| scan-core::hfs | 80,587 | 4.71% | 25 |
| scan-core::pkg | 79,541 | 4.65% | 17 |
| scan-core::apfs | 76,809 | 4.49% | 28 |
| sevenz-rust2 | 68,129 | 3.99% | 48 |
| scan-core::zip | 68,012 | 3.98% | 24 |
| scan-core::stream_bundle | 61,046 | 3.57% | 14 |
| scan-core::(root) | 56,496 | 3.30% | 24 |
| plist | 49,781 | 2.91% | 30 |
| scan-core::inflate | 40,951 | 2.40% | 12 |
| scan-core::dmg | 40,376 | 2.36% | 3 |
| roxmltree | 36,049 | 2.11% | 36 |
| ruzstd | 30,295 | 1.77% | 16 |
| scan-core::sevenz | 25,951 | 1.52% | 11 |
| zlib-rs | 23,867 | 1.40% | 13 |
| scan-core::diagnostic | 23,768 | 1.39% | 23 |
| libbz2-rs-sys | 23,235 | 1.36% | 6 |
| Unclassified symbols | 21,910 | 1.28% | 41 |
| lzfse-rust | 16,073 | 0.94% | 16 |
| scan-core::tar | 12,763 | 0.75% | 7 |
| scan-core::nested | 12,531 | 0.73% | 3 |
| scan-core::decode | 10,700 | 0.63% | 7 |
| scan-core::launcher | 10,694 | 0.63% | 2 |
| scan-core::bundle | 9,263 | 0.54% | 12 |
| js-sys | 8,398 | 0.49% | 47 |
| sha2 | 8,309 | 0.49% | 1 |
| bzip2 | 8,057 | 0.47% | 11 |
| dlmalloc | 7,898 | 0.46% | 6 |
| scan-core::local_bundle | 7,820 | 0.46% | 2 |
| unicode-normalization | 6,927 | 0.41% | 5 |
| scan-core::cpio | 6,578 | 0.38% | 6 |
| quick-xml | 5,910 | 0.35% | 8 |
| serde-json | 5,819 | 0.34% | 12 |
| scan-core::plist_value | 5,758 | 0.34% | 2 |
| hashbrown | 4,873 | 0.29% | 3 |
| scan-core::pbzx | 4,453 | 0.26% | 1 |
| wasm-bindgen | 3,698 | 0.22% | 56 |
| base64 | 3,530 | 0.21% | 1 |
| scan-core::inventory | 3,449 | 0.20% | 9 |
| scan-wasm | 3,200 | 0.19% | 3 |
| scan-core::bom | 2,580 | 0.15% | 5 |
| time | 1,622 | 0.09% | 2 |
| crc32fast | 1,343 | 0.08% | 2 |
| scan-core::udif_codec | 1,242 | 0.07% | 2 |
| scan-core::gzip_tail | 1,241 | 0.07% | 1 |
| tinyvec | 1,097 | 0.06% | 3 |
| --rustc | 1,093 | 0.06% | 5 |
| indexmap | 810 | 0.05% | 1 |
| memchr | 603 | 0.04% | 1 |
| twox-hash | 600 | 0.04% | 1 |
| flate2 | 480 | 0.03% | 2 |
| wasm-bindgen glue | 410 | 0.02% | 7 |
| Code section header | 6 | 0.00% | 0 |

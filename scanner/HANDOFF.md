# Scanner handoff

Branch `scanner-wasm`. Work began November 23, 2026 at 23:42 Central. The workspace, fixtures, adapters, and benchmark are under `scanner/`.

## Implemented and verified

| Input | Evidence and range behavior |
| --- | --- |
| Bare Mach-O | Thin, fat32 and fat64, either byte order. Reports arm64, arm64e, x86_64 and other recognized CPU types. Seeks to thin slice headers, `LC_BUILD_VERSION` or `LC_VERSION_MIN_MACOSX`, and `LC_CODE_SIGNATURE`. |
| ZIP and ZIP64 | Searches for the end record, reads the central directory, finds the shallowest app plist, and looks up `CFBundleExecutable`. Supports stored and DEFLATE members, ZIP64 sizes and offsets, and XML or binary plists. Stored members can seek straight to a late fat slice. |
| tar.gz | Reads tar sequentially through gzip and stops after identifying the declared executable. Handles GNU long names and per-member PAX paths. If the executable comes first, it keeps Mach-O observations until the plist names it. |
| DMG / UDIF | Reads the `koly` trailer, the `blkx` plist, and the touched chunks. Handles zero, raw, ignore, ADC, zlib, bzip2, LZFSE, and XZ-framed ULMO/LZMA. HFS+ and HFSX use the catalog and both inline and overflow extents. Ordinary APFS uses checksummed container checkpoints, container and volume object maps, directory records, and file extents. |
| Flat PKG / XAR | Uses the zlib TOC to locate Distribution, PackageInfo, and a Payload. Handles gzip and raw ODC/newc CPIO plus PBZX with raw and XZ blocks. Can skip PBZX blocks between known CPIO positions. Installer metadata and executables observed before the plist can survive budget exhaustion. |

`scan-core` makes no filesystem or network calls. Its async `ReadAt` accepts unsigned 64-bit offsets. Native file and HTTPS reads complete synchronously in the CLI. The Wasm adapter awaits the host callback, which can return a byte array immediately or after async I/O. The meter counts host requests and accepted bytes. A read that would exceed the budget stops before calling the host. The thin Mach-O parser visits fat slices in physical order so the same logic works over seekable and forward-only sources.

## Verification and reproduction

Use Rust 1.99.1 and Node 26.13.0. The following commands run from `scanner/`.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
cargo test --locked -j2
cargo clippy --locked -j2 --all-targets -- -D warnings
cargo build --locked -j2 -p scan-cli
cargo build --locked -j2 -p scan-wasm --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/scan_wasm.wasm
node scripts/verify-wasm.mjs
```

The glue generator must match `wasm-bindgen` 0.2.130. Install it with `cargo install wasm-bindgen-cli --version 0.2.130 --locked -j2`. This worktree's installation is also available at `target/tools/bin/wasm-bindgen`. `pkg/` contains generated browser-target glue and Wasm. The core and codec dependencies compiled for `wasm32-unknown-unknown`. The TLS dependency is native-only. Browser integration was outside this run.

Reproduce the cask scan using the live API. The JSON records the catalog hash, scanner commit, binary hash, cask URLs and versions, and the accepted strong ETag when provided.

```sh
mkdir -p target
curl -fsSL --max-time 90 --max-filesize 25000000 \
  https://formulae.brew.sh/api/cask.json -o target/homebrew-cask.json
python3 scripts/homebrew-run.py target/homebrew-cask.json
```

- [Per-cask results and evidence](results/homebrew-run-1.json)
- [Measured scan summary](results/homebrew-run-1.md)

## Measured results

- Rust passed 21 tests. Node passed 72 native/Wasm JSON comparisons across 12 fixtures, three budgets, and both host callback modes. It also checked rejected and short callback results. The generated Wasm binary was 1,141,651 bytes.
- The final run scanned 30 casks from 28 original hosts. It completed 6 of 9 ZIPs, 10 of 11 DMGs, 4 of 5 tarballs, and 1 of 5 PKGs. Seven scans reached the 8 MiB budget and preserved partial evidence. Warp returned HTTP 404 during discovery and Kunkun returned HTTP 200 to its range probe.
- The final run accepted 90,273,187 artifact bytes across 365 reported range requests. The catalog response used another 19,541,738 bytes. Including the earlier 30-item pilot, accepted bytes from the two corpus passes and the catalog totaled 175,655,096. Additional format-specific probes used bounded ranges. Counts measure accepted bodies and exclude HTTP headers and transport overhead.
- Rider’s HFS+ DMG needed 1,229,298 bytes of 2,286,054,263 (0.054%). Zed’s APFS DMG needed 905,357 of 88,779,557 (1.020%). Microsoft AutoUpdate’s flat PKG needed 4,464,480 of 4,521,461 (98.740%), and the Phoenix tarball reached 3,997,848 of 3,997,849. The installer and tar examples show how member order can erase most range savings.
- Fifteen explicit Homebrew hint comparisons were consistent with the observed architectures. Two could not be evaluated. Three ZIPs reached the budget with both fat-table architectures already identified. Four PKGs supplied provisional binaries before the declared executable could be confirmed from its plist.

## Limits and next steps

- Main executable architecture describes one binary. For app-wide compatibility, sample required runtimes, helpers, and framework binaries separately. Installer `hostArchitectures` describes installer policy. Add macOS reference checks with `lipo`, `vtool`, and `plutil` for pinned artifacts. Code-signature observations cover the load command.
- ZIP selects the shallowest matching bundle. Sequential archives select the first outer app plist and retain bounded early binary evidence. Disk images select a root-level app. Multiple apps, nested installers, and installer scripts that generate or fetch an app need separate traversal and reporting.
- Disk image coverage is limited to unencrypted, single-segment UDIF with a plist index. Files stored with `decmpfs` and APFS encrypted or sealed volumes are unsupported. APFS also omits descriptor-tree checkpoints, Fusion, and hashed or headerless B-trees. APM/GPT discovery is implemented. The corpus verified published HFS+ and APFS app images. The synthetic HFSX image exercised overflow extents.
- PKG chooses the largest Payload and reads its sibling PackageInfo where present. Nested or legacy packages and other payload codecs need additional support. A gzip stream may require reading most earlier bytes. A late inner fat slice in DEFLATE has the same limitation. Benchmark adaptive reads and alternative evidence levels before changing the default budget.
- ZIP and streaming archive scans inspect prefixes and metadata. Extracting or authenticating whole members, verifying signature blobs, and validating complete archive checksums are outside this scanner’s result.
- Hosts that return HTTP 200 for a range or fail discovery produce a source error. The CLI checks a strong ETag when available. A same-sized update without a validator can go undetected. Browser URL scans also depend on the origin’s CORS policy.

## Implementation references

- Mach-O on-disk headers and loader commands. [Apple XNU loader header](https://github.com/apple-oss-distributions/xnu/blob/main/EXTERNAL_HEADERS/mach-o/loader.h)
- ZIP and ZIP64 structure. [PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
- Disk image chunk layout, HFS+ and APFS. [libdmg UDIF definitions](https://github.com/planetbeing/libdmg-hfsplus/blob/master/includes/dmg/dmg.h), [Apple HFS Plus Volume Format](https://developer.apple.com/library/archive/technotes/tn/tn1150.html), [Apple File System Reference](https://developer.apple.com/support/downloads/Apple-File-System-Reference.pdf)
- Flat packages and PBZX payloads. [Apple XAR archive reader](https://github.com/apple-oss-distributions/xar/blob/main/xar/lib/archive.c), [go-macos-pkg payload format](https://github.com/deploymenttheory/go-macos-pkg/blob/main/docs/formats/payload.md)

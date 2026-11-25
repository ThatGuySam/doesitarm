# Container and read-budget failures

The canonical records are `~/Code/doesitarm-data/scan-ledger/attempts.jsonl` and `catalog.jsonl`. They retain the app, URL, pinned digest when available, profile, budgets, scanner revision, exact invocation, error, transfer and parser measurements, and source file and row. The ledger includes historical failures followed by later successes. Use the attempt ID when comparing a particular failure rather than the latest app status.

Extract every attempt in this workstream from the ledger, including failures from earlier tiers and runs:

```sh
jq -c 'select(.failure_class as $class | ["budget_hit","nested_container","invalid_container","unsupported_container","unsupported_codec","parser_limit"] | index($class))' \
  ~/Code/doesitarm-data/scan-ledger/attempts.jsonl
```

The [EDGE inspection](EDGE.md) and [CLIMB reports](CLIMB.md) retain earlier source layout inspections and verified local scans. A ledger kit is a sparse recording of reads the old parser made. If a successful fix needs new offsets, the original kit can show where the parser advanced, and a pinned live rerun or checked local artifact is needed to verify the app.

| App / fixture | Pinned evidence and diagnosis | Bytes read before | Bytes read after | Verification |
| --- | --- | ---: | ---: | --- |
| XAMPP 8.2.4-0 | `c2ccaced609094ef14aa5f0eca86b7d50259af034c2655546b7ff48e8c732347`, `kits/xampp-invalid_container`. Footer sector count is zero. The `mish` table declares 308,704 sectors and the stored runs fit the data fork. The first decoded run contains an ISO 9660 primary descriptor and Rock Ridge names for the app and its `Info.plist`. | 40,001 | — | Zero-sector geometry fixed below. ISO filesystem scan and pinned rerun pending. |
| RStudio 2026.11.0-203 | `6903eecd23b8f5d24b110dd1efe30d67cb89d9f693040cc8686f696b040ae1af`. `Contents/MacOS/RStudio` has a type 8 `com.apple.decmpfs` header and a 14,497-byte resource fork in an APFS data stream. | 2,400,004 | 3,288,237 | Verified the actual x86_64 and arm64 main headers with the remote CLI profile on the checksum-matching image. Worker verified both headers at 2,402,270 bytes. The optional inventories were partial. |
| JProfiler 16.3.1 | `1780ef0454f6db335dd1dca5667a43fcc9ac0c59e2e5d0e87dcad0e7562ec31e`, `kits/jprofiler-budget_hit`. The stream fallback cannot reach the UDIF footer under 8 MiB. Ledger attempt `40126cb60eaa` previously verified at the 256 MiB tier. The captured 4 bytes count completed parser reads. | 4 | 212,551,284 at 256 MiB | Historical tier recovery. |
| Soothe2 1.3.3 | `b968ad35df98f9d17d55eb3c3c73de34fe66ddee9edc1241733cb4f1a5812d64`. Four plug-in formats in distinct components. The XAR TOC locates the VST3 component and its PackageInfo names the VST3 in `<bundle-version>`. | 268,173,277 | 63,813,324 | Fixed. Automatic selection verified both VST3 headers at the 64 MiB tier against the checksum-matching artifact. At 8 MiB it found the plist and confirmed only the x86_64 header. |
| Aqua Data Studio 26.1.0 | `c8b419addd4931e5f89dabf7718bbdb36f984a7da5b78c2e437094c74cef47e1`. Sequential `.tar.gz`, with a successful checksum-verified local scan on record. | 268,435,451 | — | Pending framing and scan-order investigation. |
| Insta360 Link Controller 2.2.5 build 25 | `1979b4c560baa4a0b20ab3cc47e2e3456bfef7fbf7b36b8a65c13f8eb1c2329e`. The CPIO puts the 417,541,840-byte executable before the outer plist. A full local scan verifies. | 268,173,301 | — | Pending payload index and late plist investigation. |
| MPP Viewer Mac 0.1.3 | `dd0e2e40e7a992ab3211500814b54ff0bbe1b7a37d3dc31959dde3b78446fb8e` exceeded 8 MiB on the 85,522,821-byte PKG. The other recorded attempt (`9a89172d915d`) was blocked by robots.txt. | 8,388,608 | — | Pending legitimate public release acquisition or a higher reported tier. |
| ChronoSync | `1fe8f1b23fe209c9c64979eb804b87e1b3246e00513636f195f72c0813d2bc25`. HFS image has multiple root PKGs. | 284,798 | — | Pending ambiguity and target inspection. |
| Jumper build 3660 | `42c32ea6aae43259893a68b32e84e336fbeae7a0521fc4538a86a88ee4b7a362`. The 5,003,419,189-byte ZIP failed at a central-directory entry. | 6,360,986 | — | Pending range-backed directory inspection. |
| AMPPS 4.4 | `454c6fe92eb3899a0dd56b7475209b2b7ae1a12756edc3b8d6a49a2208f522fd`, `kits/ampps-plist_not_found`. HFS root selection found no app or package. | 16,775 | — | Pending layout inspection. |
| Hancom Word 12.30.0.6544 | `b0804cedf5def69f1121cb22e89d791c00313a7c973d0ab95143f2ec143a1575`, `kits/hancom-word-unsupported_container`. The pinned `.pkg` was 82 bytes and lacked a recognized format. | 4 | — | Pending origin response inspection. |

## Earlier parser recoveries to verify against this checkout

- FabFilter Pro-DS's nested AAX plug-in verified in `99d2df4578c7` after 7,347,312 bytes. Timeless was also verified in the held-out cohort. Keep the 12 historical nested rows and their later outcomes in the ledger.
- Qt Design Studio's solid 7z verified in `e479832a4b53` at 2,519,947 bytes. A full local scan recorded 652 Mach-O files. CodeQL's tar.zst reached its declared shell script in `92bc984eecf3` at 62,893,053 bytes.
- LaunchControl and ImageOptim still have historical XZ-stream errors at 66,055 bytes. EDGE identified their 64 MiB LZMA2 dictionaries and added native dictionary support. LaunchControl previously verified at 5,510,472 bytes in `97cd69474566`.
- The existing generated UDIF fixture exercises bzip2, ADC, LZFSE and other codecs. EDGE already has a raw GPT/HFSX fixture. Sparse image, encrypted image, APM, and segmented-image coverage is tracked separately from those recoveries.

## Zero-sector UDIF footer

`dmg_with_zero_footer_sector_count_uses_block_map_geometry` zeroes the sector count in the 66,444-byte generated bzip2-prefixed disk image. The same regression went from `invalid data: range outside its container` after 1,383 bytes to a verified bundle after 4,963 bytes. Local, remote CLI, and Worker profiles all pass. The nonzero footer still bounds the declared partition ranges. The existing segmentation test also passes. [Upstream UDIF structure](https://github.com/foxlet/dmg2img/blob/master/dmg2img.h)

## APFS LZVN resource forks

`apfs_dmg_verifies_macho_slices_in_lzvn_resource_fork_chunks` uses a 75,970-byte generated DMG with its two Mach-O slices in separate 64 KiB blocks. The first block uses LZVN and the second carries Apple's stored-block marker. Before the fix the scanner stopped at `unsupported: APFS decmpfs-compressed file` after 2,425 bytes. The updated scan verified both headers after 3,093 bytes and passes in all three profiles. It uses the APFS xattr extents and reads the two fork offsets for each requested block. The RStudio replay used the artifact with SHA-256 `8af768450f9f38586bf48958d348b41ffc4f3d42c9d225cb6d4f2b8e8b986135`. Type 8 is supported. Other compression types still return an explicit unsupported result. [Apple XNU decmpfs](https://github.com/apple/darwin-xnu/blob/main/bsd/kern/decmpfs.c) · [libfsapfs format notes](https://github.com/libyal/libfsapfs/blob/main/documentation/Apple%20File%20System%20%28APFS%29.asciidoc)

The local profile also verified both RStudio main slices. Its optional inventory stopped at an invalid decmpfs resource fork after 123,847,587 total bytes read. The failed optional entry needs its own evidence before a parser change.

## PackageInfo product selection

`pkg_auto_selects_the_product_in_packageinfo_bundle_version` reads a 1,208-byte synthetic flat package. It reproduced `not found: app Info.plist in sequential archive` after 1,208 bytes. Reading bundle declarations at the top level of `<bundle-version>` made the same scan verify both synthetic VST3 headers after the same 1,208 bytes. The nested `<bundle>` in the fixture declares a helper and stays outside product selection.

The pinned Soothe2 package's `soothe2_VST3.pkg/Payload` is a 63,805,398-byte gzip member. The larger scan used to visit enough components to spend 268,173,278 bytes on the same local-file source under the remote profile. With the fix it verifies `Library/Audio/Plug-Ins/VST3/soothe2.vst3/Contents/MacOS/soothe2` after 63,813,324 bytes with verified x86_64 and arm64 headers. The 8 MiB scan reads 8,126,454 bytes and reports budget exhaustion after verifying the Intel header only. BOM-assisted late plist recovery supplies metadata at that tier while the far header still requires a sequential read.

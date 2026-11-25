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
| XAMPP 8.2.4-0 | `c2ccaced609094ef14aa5f0eca86b7d50259af034c2655546b7ff48e8c732347`, `kits/xampp-invalid_container`. Footer sector count is zero. The `mish` table declares 308,704 sectors and the recorded stored runs fit the data fork. | 40,001 | — | Pending generated regression and rerun. |
| RStudio 2026.11.0-203 | `6903eecd23b8f5d24b110dd1efe30d67cb89d9f693040cc8686f696b040ae1af`. The bundle is discovered and the executable's APFS compressed inode is rejected. | 2,400,004 | — | Pending attribute inspection and fixture. |
| JProfiler 16.3.1 | `1780ef0454f6db335dd1dca5667a43fcc9ac0c59e2e5d0e87dcad0e7562ec31e`, `kits/jprofiler-budget_hit`. The stream fallback cannot reach the UDIF footer under 8 MiB. Ledger attempt `40126cb60eaa` previously verified at the 256 MiB tier. The captured 4 bytes count completed parser reads. | 4 | 212,551,284 at 256 MiB | Historical tier recovery. |
| Soothe2 1.3.3 | `b968ad35df98f9d17d55eb3c3c73de34fe66ddee9edc1241733cb4f1a5812d64`. Four plug-in formats in different components. The explicit VST3 path already verifies locally. | 268,173,277 | — | Pending automatic component selection investigation. |
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

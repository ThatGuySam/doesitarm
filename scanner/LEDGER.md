# Scan ledger

The native CLI reads and writes `~/Code/doesitarm-data/scan-ledger/` by default. The generated `LEDGER.md` in that directory contains the current counts, changed outcomes, failure examples, published kits, and pinned Homebrew progress.

```sh
cargo build --locked -j2 -p scan-cli
target/debug/scan-cli ledger import
target/debug/scan-cli ledger report
target/debug/scan-cli ledger history 'https://example.invalid/app.zip'
target/debug/scan-cli ledger show LEDGER_ID
target/debug/scan-cli ledger rerun budget_hit --limit 3
target/debug/scan-cli ledger kit LEDGER_ID --out ./repro
target/debug/scan-cli ledger replay ./repro
target/debug/scan-cli ledger resume --limit 400 --seconds 3600
```

Pass `--root DIR` for a different output directory. Import also accepts `--scanner DIR` and `--data DIR`. The scanner directory is the Cargo workspace directory containing the pinned catalog under `results/climb/full-run/`.

## Stored evidence

- `attempts.jsonl` contains a schema-versioned history. A replay append records its parent attempt and whether its observed outcome was fixed, regressed, stayed the same, or changed failure class.
- `latest.jsonl` maps original URLs to the most recent attempt ID. The `latest` command emits those complete records. Compare individual archive targets with `history`.
- `catalog.jsonl` contains the pinned declarations and exclusions, unresolved lists, inspection notes, and scrubbed triage documents with their paths and hashes. Unattempted catalog declarations do not count as attempts.
- A record points to its source file, line, optional JSON locator, and SHA-256. The attempt ID hashes source, redacted original URL, scanner revision, and a timestamp bucket qualified by a stable row and tier discriminator.
- Legacy rows retain the evidence their producer stored. Several pilots saved their final projected result and tier sizes only. Earlier invocations from those pilots are marked `unrecorded_outcome`. Source projections have no reconstructed ScanResult. Empty fields represent unavailable evidence. A capture can also contain fewer than 512 prefix bytes if the scanner read less.
- A diagnostic executable fingerprint covers the fixed Mach-O header for a thin binary and the outer header with its architecture table for a fat binary. The plist fingerprint covers the original bytes before XML or binary parsing. Both use reads the scanner already performs.

## Replaying failures

A kit records byte spans from a new observation of a pinned artifact. The CLI checks that the failure class matches the selected attempt and checks the available size and ETag before publishing. It verifies the kit against the new observation by running the scanner offline and comparing class, status, and error. The sparse reader rejects requests outside recorded spans. It can also serve a revised parser that splits or coalesces covered spans. A status rejection such as HTTP 404 has zero artifact bytes and is replayed through the range response validator.

For a local-profile attempt, pass `--input FILE` with the original archive to capture it in place. The exact path is not written into the ledger. Every kit is under 2 MB. When the selected attempt reads too much, changes at the origin, has no public artifact route, or needs protected bytes, the new observation is still recorded when available. Whole artifacts are never placed in the ledger. The cache holds temporary stream spools while the scanner is active and requires 20 GB of available disk. Ledger commands serialize live requests against the same cache.

Path usernames and known credential-bearing URL query values are scrubbed recursively. A SHA-256 placeholder preserves correlation between matching credential values. Original URLs with replaced credentials need a fresh authorized URL from the original catalog or update feed. Kits keep exact bytes and refuse captures when a recognizable home path or credential appears in their recorded ranges. Recheck rights and metadata on separately supplied local artifacts before using them as raw fixtures.

## Access and acquisition

- HTTP 404 preserves the pinned URL and response. A replacement URL from Homebrew or the vendor is a new representation.
- HTTP 401, robots restrictions, and license or payment gates need their documented discovery or vendor acquisition flow. For SEGGER J-Link, the edge inspection records the landing page and the Homebrew POST declaration. An entitled user can obtain the installer through SEGGER's own flow and then run the local scanner.
- High transfer failures stay tied to their actual tier and request log. When creating a test fixture, preserve the failing layout and the specific scanner condition using a small generated or recorded artifact.

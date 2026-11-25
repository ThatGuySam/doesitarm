# Container and read-budget checkpoint

Started 2026-11-24 at 18:24 Central. Stop by 20:04 Central. Both integration gates were present. The base is `scanner-preview` at `bb62a7c`; the ledger instructions came from `scanner-ledger` at `2d02b4d`.

Worktree `/home/tiki/Code/doesitarm-scanner-fix-containers-local` is on `scanner-fix-containers`. The requested path already contained protected placeholder directories and Git could not initialize it. Keep work local. Run one offline Cargo build at a time with `-j2` and keep artifact downloads temporary under `~/.cache/doesitarm-fix-containers/`.

The format and application evidence is in [FIX-CONTAINERS.md](FIX-CONTAINERS.md). Start with the offline XAMPP replay, then investigate APFS compression and the package budget failures. The full ledger remains under `~/Code/doesitarm-data/scan-ledger/`; the ledger CLI was built separately at `~/.cache/doesitarm-scanner-ledger/target/release/scan-cli`.

The zero-sector UDIF fix passed the workspace tests. The XAMPP kit proves the old error and contains the footer and index only. The first decoded run inspected from the origin shows ISO 9660 with Rock Ridge. RStudio's checksum-matching image confirms `com.apple.decmpfs` type 8 on its primary; capture and packed fork extent metadata are described in the report as the work progresses.

APFS type 8 passed the workspace suite and the full pinned RStudio replay verified both architectures. Next reproduce the Soothe2 PackageInfo layout, Rock Ridge boot image, and Jumper's 32-bit ZIP rollover. The interim XAMPP full transfer timed out after 21,184,235 bytes and was removed. Use a bounded range rerun for XAMPP and Jumper.

The Soothe2 PackageInfo fix passed the targeted package tests and recovered the real VST3 in 63,813,324 bytes. The full Soothe2, RStudio, and Insta360 downloads were removed after validation. The Insta360 BOM and exact DEFLATE block inspection explain the remaining 256 MiB limitation. The Rock Ridge fix verified XAMPP's installer metadata and recovered its script entry point under the same ETag. All 36 format tests passed.

Jumper verified both launcher slices over ranges at the 8 MiB tier. Next inspect the remaining budget and nested-container rows and verify DMG variants. The scanner source branch still starts at the integrated `scanner-preview` baseline, with the ledger driver kept in a scratch overlay for reruns.

Sparse APM/HFSX and encrypted signature regressions passed. Runs are offline apart from the separately paced ledger campaign, whose durable status summary belongs in `FIX-CONTAINERS.md`. The current scratch ledger records are under `~/.cache/doesitarm-fix-containers/rerun-ledger/attempts.jsonl`. The generated cases use no external archive, login, or network in tests.

AMPPS now resolves the visible wrapper and verifies its x86_64 primary. The checksum-matching 62,998,351-byte image was removed. ChronoSync's 102,704,658-byte image has an application installer and an independent removal package. Its installer declares a helper under Library and the public app under Applications. Reproduce this with `install-remove.dmg` before changing selection.

Contents-relative plug-in payloads now use a recognized PackageInfo installation root. TDR Nova's pinned range rerun verified both AAX slices on the same ETag. The current native workspace tests passed all 40 format tests before adding the independent ChronoSync regression.

ChronoSync's paired-package fix verified the unique application under Applications and both main slices. The native workspace passed 60 Rust tests with the ChronoSync change. The remaining focused case is MySQL Shell's explicit binary path through a nested flat PKG, which is recorded in the installer BOM. Then complete the native, Wasm, and ledger verification on the final parser.

MySQL Shell verifies the BOM-named arm64 executable at 4,623,388 bytes after the HFS nested target fix. ChronoSync and MySQL Shell full images have been removed. The native workspace passed all 61 Rust tests. Finish the final ledger reruns and Wasm parity checks, then capture the remaining budget classifications and confirm a clean worktree.

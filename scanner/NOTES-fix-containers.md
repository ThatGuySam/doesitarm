# Container and read-budget checkpoint

Started 2026-11-24 at 18:24 Central. Stop by 20:04 Central. Both integration gates were present. The base is `scanner-preview` at `bb62a7c`; the ledger instructions came from `scanner-ledger` at `2d02b4d`.

Worktree `/home/tiki/Code/doesitarm-scanner-fix-containers-local` is on `scanner-fix-containers`. The requested path already contained protected placeholder directories and Git could not initialize it. Keep work local. Run one offline Cargo build at a time with `-j2` and keep artifact downloads temporary under `~/.cache/doesitarm-fix-containers/`.

The format and application evidence is in [FIX-CONTAINERS.md](FIX-CONTAINERS.md). Start with the offline XAMPP replay, then investigate APFS compression and the package budget failures. The full ledger remains under `~/Code/doesitarm-data/scan-ledger/`; the ledger CLI was built separately at `~/.cache/doesitarm-scanner-ledger/target/release/scan-cli`.

The zero-sector UDIF fix passed the workspace tests. The XAMPP kit proves the old error and contains the footer and index only. The first decoded run inspected from the origin shows ISO 9660 with Rock Ridge. RStudio's checksum-matching image confirms `com.apple.decmpfs` type 8 on its primary; capture and packed fork extent metadata are described in the report as the work progresses.

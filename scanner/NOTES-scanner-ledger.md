# Scan ledger checkpoint

Started Nov 24, 2026 from integrated scanner-preview `bb62a7c` after the integration marker. Worktree branch is `scanner-ledger`. The Homebrew manifest is pinned at 7,570 entries and 676 completed. Historical scan metadata is available in the integrated checkout and the data directory. The historical files generally do not include the body of each range read.

Implementation order is durable import and reporting, capture and offline replay, catalog continuation, then verification and handoff. Local commits only.

The Rust ledger now imports raw attempts and source projections, writes a latest-view index and report, and can run the pinned catalog sequentially from the first pending entry. Live captures record sparse spans and exercise the existing parser offline. A kit is published only if the live failure class matches the selected historical record and replay returns the same class, status, and error. Initial verification and the catalog continuation are pending.

Fingerprints now hash the raw plist and Mach-O header without extra reads. The native file, HTTP, and replay paths share a blocking source adapter to keep their parser implementation identical. The first optimized build was interrupted after several minutes during CLI code generation on the shared machine. The continuation build uses package optimization level 1 for the CLI.

The first import produced 3,107 records covering 874 app tokens, plus 8,179 catalog evidence rows. The first continuation began at 17:36 Central from position 677 using `da24b6f`. Warp's 404 was captured and verified offline. The working release CLI is under `~/.cache/doesitarm-scanner-ledger/target/release/`. Current data and kits are under `~/Code/doesitarm-data/scan-ledger/`.

The live scan loop resumed at position 677 and verified Synology Surveillance Station Client at the 256 MiB tier. Eight other artifact and transport classes plus Dropzone's representation-change failure reproduced offline. Mini vMac reproduced too, but its read spans contained the complete 59,399-byte archive. The generated folder was removed and kit publication now rejects whole-artifact coverage. The initial historical checkpoint is validated by manifest SHA-256 and identity, and skips the original 676 entries.

At 17:39 Central, 10 published kits covered 10 failure classes with partial artifact coverage. The released replacement for Mini vMac was Rolisteam. The report recorded 689/7,570 checked at that handoff. The first hour-long catalog slice remains active and appends attempts as they complete.

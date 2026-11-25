# Scan ledger checkpoint

Started Nov 24, 2026 from integrated scanner-preview `bb62a7c` after the integration marker. Worktree branch is `scanner-ledger`. The Homebrew manifest is pinned at 7,570 entries and 676 completed. Historical scan metadata is available in the integrated checkout and the data directory. The historical files generally do not include the body of each range read.

Implementation order is durable import and reporting, capture and offline replay, catalog continuation, then verification and handoff. Local commits only.

The Rust ledger now imports raw attempts and source projections, writes a latest-view index and report, and can run the pinned catalog sequentially from the first pending entry. Live captures record sparse spans and exercise the existing parser offline. A kit is published only if the live failure class matches the selected historical record and replay returns the same class, status, and error. Initial verification and the catalog continuation are pending.

Fingerprints now hash the raw plist and Mach-O header without extra reads. The native file, HTTP, and replay paths share a blocking source adapter to keep their parser implementation identical. The first optimized build was interrupted after several minutes during CLI code generation on the shared machine. The continuation build uses package optimization level 1 for the CLI.

The first import produced 3,107 records covering 874 app tokens, plus 8,179 catalog evidence rows. The first continuation began at 17:36 Central from position 677 using `da24b6f`. Warp's 404 was captured and verified offline. The working release CLI is under `~/.cache/doesitarm-scanner-ledger/target/release/`. Current data and kits are under `~/Code/doesitarm-data/scan-ledger/`.

The live scan loop resumed at position 677 and verified Synology Surveillance Station Client at the 256 MiB tier. Eight other artifact and transport classes plus Dropzone's representation-change failure reproduced offline. Mini vMac reproduced too, but its read spans contained the complete 59,399-byte archive. The generated folder was removed and kit publication now rejects whole-artifact coverage. The initial historical checkpoint is validated by manifest SHA-256 and identity, and skips the original 676 entries.

At 17:39 Central, 10 published kits covered 10 failure classes with partial artifact coverage. The released replacement for Mini vMac was Rolisteam. The report recorded 689/7,570 checked at that handoff. The first hour-long catalog slice remains active and appends attempts as they complete.

At 17:56 Central the first continuation was still active at 818/7,570, with 3,303 attempt records and 1,598 failures in the report. XAMPP supplied the eleventh kit. Offline replay matched the stored failure class, status, error, read counters, architecture, inventory, and diagnostics for all 11 published kits. All 11 generated Cargo test stubs passed. The current build passed 60 Rust tests, Clippy, 222 native/Wasm comparisons, 36 browser-free Node tests, 31 generated edge fixtures, and 6 Python runner tests. Two imports to an isolated ledger produced byte-identical files. A live `ledger rerun` of the pinned WordPress.com Studio range failure returned verified and appended a `fixed` attempt with the original ID as its parent.

The first scan slice began at 17:36 Central. The ledger command stops after one hour or 400 artifacts. The overall 100-minute deadline is 19:05 Central. A later slice can resume from the first unfinished manifest entry using the release CLI in the ledger cache.

The first batch finished at 18:30 Central with its 400-artifact cap reached. It completed positions 677–1,076 in 485 target and tier attempts. Final artifact outcomes included 332 verified apps, five verified executables, and one verified plug-in. The ledger then contained 3,618 attempts, 1,700 failures, 1,364 current URLs, and 11 verified kits using 23,339,639 bytes. The next pinned position is 1,077. The next hourly slot starts at 18:36 Central, and the remaining overall window ends at 19:05 Central.

The archived Dintch range-to-verified transition exposed a report regression. It failed the direct report check before the change and appeared afterward. The report now compares each run’s last observed tier within its source, URL, profile, and target. The added test brought the Rust total to 61, all passing.

The second batch finished at 19:02 Central, ahead of the 100-minute cutoff. It completed positions 1,077–1,326 in 291 target and tier attempts on `2d02b4d`. Across both batches, 650 additional Homebrew artifacts were checked. The pinned catalog is at 1,326 of 7,570, and position 1,327 is `workbuddy-ai`.

The final report and audit verified 3,909 attempt records, 1,402 distinct app tokens, 1,606 latest URL pointers, 1,782 failure records, and 8,179 catalog evidence rows. All 11 kits replayed and remained below 2 MB, with no whole-artifact coverage. Total stored bytes were 25,765,358. The final import refreshed the history from the original sources and left the attempt count unchanged.

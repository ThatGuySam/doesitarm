# Scan ledger checkpoint

Started Nov 24, 2026 from integrated scanner-preview `bb62a7c` after the integration marker. Worktree branch is `scanner-ledger`. The Homebrew manifest is pinned at 7,570 entries and 676 completed. Historical scan metadata is available in the integrated checkout and the data directory. The historical files generally do not include the body of each range read.

Implementation order is durable import and reporting, capture and offline replay, catalog continuation, then verification and handoff. Local commits only.

The Rust ledger now imports raw attempts and source projections, writes a latest-view index and report, and can run the pinned catalog sequentially from the first pending entry. Live captures record sparse spans and exercise the existing parser offline. A kit is published only if the live failure class matches the selected historical record and replay returns the same class, status, and error. Initial verification and the catalog continuation are pending.

Fingerprints now hash the raw plist and Mach-O header without extra reads. The native file, HTTP, and replay paths share a blocking source adapter to keep their parser implementation identical. The first optimized build was interrupted after several minutes during CLI code generation on the shared machine. The continuation build uses package optimization level 1 for the CLI.

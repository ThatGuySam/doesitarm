# Scan ledger checkpoint

Started Nov 24, 2026 from integrated scanner-preview `bb62a7c` after the integration marker. Worktree branch is `scanner-ledger`. The Homebrew manifest is pinned at 7,570 entries and 676 completed. Historical scan metadata is available in the integrated checkout and the data directory. The historical files generally do not include the body of each range read.

Implementation order is durable import and reporting, capture and offline replay, catalog continuation, then verification and handoff. Local commits only.

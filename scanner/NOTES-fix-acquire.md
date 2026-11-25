# Acquisition fixes

Started 2026-11-24 at 19:03 CST. Stop by 20:43 CST. The integration marker and both branch documents were present at the first poll. Base is `scanner-preview` at `bb62a7c`. Source-tools merged in `b661a59`.

Use one offline Cargo job group at a time with `-j2`. Use one live request at a time per host and at most two total. Use `~/.cache/doesitarm-fix-acquire/` for live scratch and remove downloads after use. Keep at least 20 GB available. Commit locally with the requested co-author trailer.

Source of truth for historical attempts is `~/Code/doesitarm-data/scan-ledger/`. Start with pinned GitHub release assets, then range consistency, partial transfers, Worker egress and vendor access cases. See `FIX-ACQUIRE.md` for per-case evidence and reruns as each lands.

- Merge compile fix `9838a12` maps the integrated core's script and missing executable statuses in source-tools.
- GitHub resolver fixtures passed with the original dependency versions. Live wBlock passed. Remaining live runs are under `~/.cache/doesitarm-fix-acquire/github-rest` and `sparkle-github`.
- Worker egress has red/green fixtures for User-Agent, post-probe redirect, and loops. All 39 Node tests passed using the integrated Worker Wasm and this worktree's native CLI.
- The evidence snapshot contains 285 historical acquisition attempts, covering 160 app tokens or names and 168 URLs.
- Green workspace suite passed 77 tests after the native probe, retry, stream safety and source-tools changes. A separate offline CLI replay confirmed the relative GitHub appcast route.
- Completed 15 native CLI replays and seven source-tools runs. One native scan and one single-input source run overlapped on distinct hosts. The GitHub cohorts used source-tools' global and per-host limits.
- Final live findings and commands are in `FIX-ACQUIRE.md` and `results/acquire/{native,source}-replays.jsonl`. All 42 GitHub-hosted cases obtained artifact bytes and 37 fully verified.
- Jabra and BetterTouchTool reached the byte and time limits respectively after fetching installer data. The archived outputs preserve that partial evidence. Warp's pinned URLs remain dead and its vendor replacement exhausted a bounded stream scan. SEGGER and SAP require the publisher's attestation or license flow.
- Final Rust suite, Node unit suite, generated edge fixtures, campaign unit suite, source-tools replay smoke test, formatting and Clippy passed. The work is in local commits on `scanner-fix-acquire`.

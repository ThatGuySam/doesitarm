# Scanner round two

Started November 25, 2026 at 00:49 Central. Stop by 02:39 Central. The named worktree starts at `scanner-pages` (`12b3b2c`). The three fix branches are merged only into `scanner-fix-round2`. The sandbox adds read-only placeholders at the requested path and mounts linked Git metadata read-only. The authorized worktree initialization and local Git writes use auto-reviewed escalation.

The merge combines APFS compressed reads with the bundle plist changes, retains HFS grouped selection and package fallback, and preserves both sets of Wasm fixtures. It keeps the Pages three-redirect limit and DNS refresh while pinning successful range responses and detecting loops. Both resolver crates are in the workspace. ISO 9660 retains its prior required executable declaration.

Use one Cargo build at a time with `-j2`, at most two HTTP requests overall and one per host, and temporary artifact bodies under `~/.cache/doesitarm-fix-round2/`. Main report is [FIX-ROUND2.md](FIX-ROUND2.md). First step in progress is the gzip budget classification and checksum-verified local replays.

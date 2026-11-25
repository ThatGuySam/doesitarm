# Scanner round two

Started November 25, 2026 at 00:49 Central. Stop by 02:39 Central. The named worktree starts at `scanner-pages` (`12b3b2c`). The three fix branches are merged only into `scanner-fix-round2`. The sandbox adds read-only placeholders at the requested path and mounts linked Git metadata read-only. The authorized worktree initialization and local Git writes use auto-reviewed escalation.

The merge combines APFS compressed reads with the bundle plist changes, retains HFS grouped selection and package fallback, and preserves both sets of Wasm fixtures. It keeps the Pages three-redirect limit and DNS refresh while pinning successful range responses and detecting loops. Both resolver crates are in the workspace. ISO 9660 retains its prior required executable declaration.

Use one Cargo build at a time with `-j2`, at most two HTTP requests overall and one per host, and temporary artifact bodies under `~/.cache/doesitarm-fix-round2/`. Main report is [FIX-ROUND2.md](FIX-ROUND2.md). First step in progress is the gzip budget classification and checksum-verified local replays.

The integration workspace passed 127 offline Rust tests. The checksum-matched Aqua, Insta360, Papyrus and openFrameworks artifacts are in the temporary local replay queue. The ledger contains other capped PKGs. Bounded XAR probes confirmed gzip payloads for Arm Performix, BlueStacks, Cardinal, Outlook, napari, and both Unity editor support packages. MAMP's pinned origin responded with a whole stream. The same local audit will distinguish missing app targets from true byte limits.

The four exact local replays verified Aqua (835,675,421 bytes), Insta360 (772,116,907), Papyrus (716,043,951) and openFrameworks projectGenerator (512,487,086). The capped file-backed controls all exhausted 256 MiB. Full publisher artifacts were deleted. Additional capped PKGs verified BlueStacks, MAMP, Cardinal, Outlook and Arm Performix locally. The published napari digest differs from the catalog. The publisher-digested local scan and Unity iOS support reached their payloads without an app plist. The final Android support replay is still transferring.

Unity Android support finished at 1,738,756,155 source bytes without finding an app plist. The checksum-matched package was deleted. Gzip cases are classified. Next is the pinned Krisp package, with inspection restricted to static package bytes.

Krisp's normal app component is empty. Its declared postinstall Scripts CPIO contains an actual nested XAR with the arm64 app. A 1,869-byte fixture reproduced the missing plist before the code change and now passes in all three profiles. The release-mode full outer-package reruns are in progress. The scan uses package data directly and never runs installer code.

The package parser now shares its code across direct and replayed readers, keeping compilation and Wasm code generation from duplicating the whole parser for each nested reader type. The offline core suite passes after that change. A targeted native build is finishing the byte-count replay against the preserved outer installer.

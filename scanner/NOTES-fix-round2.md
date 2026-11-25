# Scanner round two

Started November 25, 2026 at 00:49 Central. Stop by 02:39 Central. The named worktree starts at `scanner-pages` (`12b3b2c`). The three fix branches are merged only into `scanner-fix-round2`. The sandbox adds read-only placeholders at the requested path and mounts linked Git metadata read-only. The authorized worktree initialization and local Git writes use auto-reviewed escalation.

The merge combines APFS compressed reads with the bundle plist changes, retains HFS grouped selection and package fallback, and preserves both sets of Wasm fixtures. It keeps the Pages three-redirect limit and DNS refresh while pinning successful range responses and detecting loops. Both resolver crates are in the workspace. ISO 9660 retains its prior required executable declaration.

Use one Cargo build at a time with `-j2`, at most two HTTP requests overall and one per host, and temporary artifact bodies under `~/.cache/doesitarm-fix-round2/`. Main report is [FIX-ROUND2.md](FIX-ROUND2.md). First step in progress is the gzip budget classification and checksum-verified local replays.

The integration workspace passed 127 offline Rust tests. The checksum-matched Aqua, Insta360, Papyrus and openFrameworks artifacts are in the temporary local replay queue. The ledger contains other capped PKGs. Bounded XAR probes confirmed gzip payloads for Arm Performix, BlueStacks, Cardinal, Outlook, napari, and both Unity editor support packages. MAMP's pinned origin responded with a whole stream. The same local audit will distinguish missing app targets from true byte limits.

The four exact local replays verified Aqua (835,675,421 bytes), Insta360 (772,116,907), Papyrus (716,043,951) and openFrameworks projectGenerator (512,487,086). The capped file-backed controls all exhausted 256 MiB. Full publisher artifacts were deleted. Additional capped PKGs verified BlueStacks, MAMP, Cardinal, Outlook and Arm Performix locally. The published napari digest differs from the catalog. The publisher-digested local scan and Unity iOS support reached their payloads without an app plist. The final Android support replay is still transferring.

Unity Android support finished at 1,738,756,155 source bytes without finding an app plist. The checksum-matched package was deleted. Gzip cases are classified. Next is the pinned Krisp package, with inspection restricted to static package bytes.

Krisp's normal app component is empty. Its declared postinstall Scripts CPIO contains an actual nested XAR with the arm64 app. A 1,869-byte fixture reproduced the missing plist before the code change and now passes in all three profiles. The release-mode full outer-package reruns are in progress. The scan uses package data directly and never runs installer code.

The package parser now shares its code across direct and replayed readers, keeping compilation and Wasm code generation from duplicating the whole parser for each nested reader type. The offline core suite passes after that change. A targeted native build is finishing the byte-count replay against the preserved outer installer.

The full Krisp outer installer verified arm64 locally after 267,032,977 unique bytes and 1,068,167,867 requested bytes. The 256 MiB control found the nested path and exhausted its request limit before architecture verification. Both temporary PKGs were removed. LaTeXiT 1.15.0's exact public DMG downloaded over verified HTTPS. Its embedded name is in the development-region InfoPlist.strings, while the base plist and both Mach-O slices lack minimum-system declarations.

The localized HFS name fixture failed as expected, then passed in all three profiles. The new optional lookup follows the plist's development region. The vendor minimum remains a distinct source. The pinned LaTeXiT red/green local-file comparisons are queued in the native build session.

Both Warp Homebrew pins still return 404. The public stable selector resolves to a 343,072,502-byte DMG whose origin ignores both absolute and suffix ranges. The full artifact was downloaded once and removed after the local scanner verified both headers using 5,940,177 source bytes. The 256 MiB stream control still exhausts its transfer budget before the UDIF footer. Next is BetterTouchTool's deadline.

The pinned LaTeXiT replay recovered the embedded name at 1,901,642 capped or 3,826,804 local bytes, unchanged from the matching controls. Architecture and unknown minimum were preserved. The old DMG was removed. BetterTouchTool's pinned archive yields both primary headers before the native 16-second deadline, with optional inventory still running when the timer expires.

BetterTouchTool's late arm64 slice needs 36,214,826 compressed bytes to reach its header. The 16-second native control verified both headers and stopped during optional inventory. Two offline tests reproduced ten ZIP reads where eight suffice and a Source-tools timeout replacing a verified primary. The changes are in place and the combined workspace suite is running.

All 131 workspace Rust tests passed with both BetterTouchTool regressions. The Source-tools 120-second control independently reproduced its false timeout after both headers. The compressed prefix and per-host request pacing explain why its stricter 16-second control reached only the first header.

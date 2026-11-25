# Bundle and entry-point fix notes

- Start 2026-11-24 18:56 Central. Stop by 20:36 Central. Integration marker and both branch documents were present on the first check.
- Branch `scanner-fix-bundles` starts at integrated preview `bb62a7c`. Its checkout is `~/Code/doesitarm-scanner-fix-bundles-local` because the requested path has protected placeholders.
- Inputs: `~/Code/doesitarm-data/scan-ledger` (attempts and sparse kits), `~/Code/doesitarm-scanner-edge/scanner/results/{climb,edge}` (pinned reports and inspections), and the AgentSessions 3.8.2 fixture merged into preview.
- The sibling container branch already has verified fixes for Soothe2 automatic package product selection and RStudio APFS compression. Its `scanner/FIX-CONTAINERS.md` gives the fixture, live measurements, and gaps.
- First reproduction: archive input with AgentSessions-style missing CFBundleExecutable and a same-stem Mach-O. Preserve the verified-only directory behavior.
- Missing-key archive fixtures now pass targeted red/green checks. Full workspace tests are running. Used the original SQLCipher, Rolisteam and Kotlin LSP sparse kits for offline baseline replays.
- Sci-Hub EVA 6.5.1 was downloaded once from its pinned GitHub release. SHA-256 `769aa2eff2e44b926bbde6b1611355af09cabd50e281864ea57d2d3051d8754d`. Preview fails its declared primary lookup at the doubled `MacOS/MacOS` path while the local inventory verifies the real arm64 file under one `MacOS` directory. Full download deleted. Raw local output is `~/.cache/doesitarm-fix-bundles/scihub-preview.json`.
- LaTeXiT 1.15.0's pinned HTTPS artifact failed TLS during a single bounded download. The ledger already records i386 and PPC, missing name and minimum, and the embedded 1.15.0 version.
- The first full workspace run passed all 52 Rust tests. The Contents-relative DMG regression failed before the fix at the doubled HFS path and passed for HFS and APFS in all profiles. All 34 format tests passed after that change.
- `BUNDLE-ATTEMPTS.jsonl.gz` captures 1,103 source attempts (399 token and URL pairs). `BUNDLE-ATTEMPTS.md` accounts for each of the 24 full-climb plist artifacts and groups unclassified outcomes.
- Two Node verdict regressions failed on the previous headline and passed after the UI change. All 11 offline UI tests pass. The mixed-inventory fixture keeps both binaries. LaTeXiT's legacy i386 and PPC evidence has no Rosetta claim.

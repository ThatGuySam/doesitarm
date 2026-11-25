# Bundle and entry-point fix notes

- Start 2026-11-24 18:56 Central. Stop by 20:36 Central. Integration marker and both branch documents were present on the first check.
- Branch `scanner-fix-bundles` starts at integrated preview `bb62a7c`. Its checkout is `~/Code/doesitarm-scanner-fix-bundles-local` because the requested path has protected placeholders.
- Inputs: `~/Code/doesitarm-data/scan-ledger` (attempts and sparse kits), `~/Code/doesitarm-scanner-edge/scanner/results/{climb,edge}` (pinned reports and inspections), and the AgentSessions 3.8.2 fixture merged into preview.
- The sibling container branch already has verified fixes for Soothe2 automatic package product selection and RStudio APFS compression. Its `scanner/FIX-CONTAINERS.md` gives the fixture, live measurements, and gaps.
- First reproduction: archive input with AgentSessions-style missing CFBundleExecutable and a same-stem Mach-O. Preserve the verified-only directory behavior.

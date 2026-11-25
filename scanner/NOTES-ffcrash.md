# Firefox large folder investigation

- 2026-11-25. Started `scanner-ffcrash` at the live preview revision `bb62a7c`. `scanner-pages` at `12b3b2c` changes the page and URL scanner but shares the folder walker, local picker, and diagnostics. Measure it as a separate baseline.
- Installed Playwright Firefox 159.0 into `~/.cache/ms-playwright`. Testing on Linux can distinguish native Firefox enumeration from scanner work. A macOS signature and the actual Applications depth histogram are unavailable, so the fixture models plausible package sizes and depths.
- Next, compare a bare native directory input with the deployed scanner path and the Chromium handle path. Record content and parent RSS separately.

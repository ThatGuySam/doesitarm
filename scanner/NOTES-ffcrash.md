# Firefox large folder investigation

- 2026-11-25. Started `scanner-ffcrash` at the live preview revision `bb62a7c`. `scanner-pages` at `12b3b2c` changes the page and URL scanner but shares the folder walker, local picker, and diagnostics. Measure it as a separate baseline.
- Installed Playwright Firefox 159.0 into `~/.cache/ms-playwright`. Testing on Linux can distinguish native Firefox enumeration from scanner work. A macOS signature and the actual Applications depth histogram are unavailable, so the fixture models plausible package sizes and depths.
- Next, compare a bare native directory input with the deployed scanner path and the Chromium handle path. Record content and parent RSS separately.
- Native Playwright path injection, with a local connection and disk path, reproduced the same pre-`change` pressure on a bare `<input webkitdirectory>` and on the preview. The 2,500 MiB browser-tree guard stopped both at about 16.6 s. Peak Firefox parent RSS was 2,138 MiB bare and 2,100 MiB on preview. Content RSS stayed near 132 MiB. Earlier remote Playwright runs streamed the directory through Node and are excluded.
- Removed the recursive file picker. `Choose folder` uses a directory handle where available. Other browsers get drag-and-drop guidance and a regular file picker for archives. Lazy discovery batches file probes, reopens confirmed binaries when scanned, and waits for queue capacity.
- Next, persist diagnostic rows as scans settle, then run the reload regression and compare the other branch and lazy paths with the same fixture.

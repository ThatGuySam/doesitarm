# Scanner v3 navigation and padding (branch scanner-nav)

Started 2026-11-27. Two tasks: mount the scanner inside the real doesitarm.com layout, and add a spacing check.

## Design
- The scanner markup is one fragment (`<div class="dia-scanner">`, between the `scanner:start/end` markers in `web/public/index.html`). The standalone page wraps it in a tiny shell (`shell.css`: body background, navbar, skip link). The build writes the fragment to `dist/scanner-fragment.html`.
- All scanner CSS is scoped under `.dia-scanner` (generated once from the old global sheet, then hand-edited). View level, drag and touch state live on the container, not on `html` or `body`.
- The doesitarm frontend Worker renders the real default page (`handle`), fetches the fragment over the service binding, and swaps it into `div.app-main` with HTMLRewriter. Head, navbar, footer and analytics stay as the default renders them. It adds noindex, a canonical to the default page, `no-store`, and a small "Switch to v1" line.
- Spacing tokens `--sp-0..5` (4, 8, 12, 16, 24, 40 px).
- Chromium 155 renderer crashes when reading `gridTemplateColumns` on some grids; the check avoids it.

## Check
`node test/padding-check.mjs [--target standalone|layout] [--url URL] [--out f.json] [--shots dir]`. Rules: padding-tight, edge-touch, overflow, sibling-align, sibling-gap, label-control, over-padding, page-overflow.

## Results (2026-11-27)
- Spacing check, standalone, 102 state views (3 widths x levels x states): before 239 failures (raw 268; 29 were check false positives on scroll containers, the dialog top layer, the absolute skip link and lazy list rows, removed offline and recorded in before-standalone.json): edge-touch 81, padding-tight 90, sibling-align 54, label-control 14. After: 0. In-layout (local harness built from the live site HTML): 0. Live https://doesitarm.com/apple-silicon-app-test/?v=3: 0.
- Isolation check (computed styles of 34 scanner elements, standalone vs in layout, and vs live): 0 differences. It relies on the host html font-size being 20px.
- Deployed: scanner Worker doesitarm-scanner-preview version ad018cd8-013f-4510-8182-b98a2d5e571c (previous fa3976f9, before that 0bd1118f-424d-4e9f-9aeb-367a4df38b37). Frontend doesitarm-cf-preview version cb4e7282-8d99-4335-b906-63742d077a81 from doesitarm commit 2f22626 (previous d01fab5d-0277-463e-85b3-28fa5c29f046).
- Live: default and ?v=1 HTML identical to before after normalizing IDs; ?v=3 has the full nav and footer, noindex, no-store, DMG URL scan (Rectangle 0.84, universal) and wasm 200 application/wasm.
- Rollback: `git revert 2f22626` in doesitarm and push, or wrangler rollback cb4e7282's predecessor d01fab5d. Scanner: wrangler rollback to fa3976f9 or 0bd1118f.
- Not verified: Safari, Firefox (native CSS has no nesting; relies on :has and content-visibility as before), doesitarm Playwright suite (needs a local workerd build; not run), pnpm build.

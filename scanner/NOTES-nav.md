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

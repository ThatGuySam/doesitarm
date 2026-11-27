# Does It ARM UI review

## November 27, 2026

- Started from detached `9520316` in `doesitarm-shadcn`. The main checkout is in use by other sessions.
- Captured production GET baselines before edits. Home, app test, scanner v3, benchmarks and Node.js each returned 200 after redirects. `/ui` returned 404.
- Chose a separate Vite entry and Tailwind 4 build with an Astro review shell. See [RESEARCH.md](./RESEARCH.md) for the upstream sources and architecture tradeoffs.
- A Sol sub-agent is building the review catalog. The Opus review is owned by the lead.
- Baseline Cloudflare and Netlify Astro builds completed. Cloudflare local workerd needed a writable `XDG_CONFIG_HOME` in scratch for its development registry. The standard prebuild and postbuild checks passed, and Vitest passed 131 tests with 3 existing TODOs.
- Saved reference screenshots from the live site at 1440×1000 and 390×844. The app page has a desktop reference.
- Adding a conventional `.astro` page caused global Tailwind v3 preflight to split into a new CSS asset and changed the stylesheet hash on the original site. The final shell is an Astro HTML endpoint backed by the review's Vite asset manifest. The Cloudflare `_astro` directory then matched byte for byte. HTML for `/`, `/apple-silicon-app-test`, `/benchmarks` and `/app/nodejs` matched after normalizing Astro island UIDs, generated subscription and video row IDs, and relative age text.
- The gallery has 68 cards (64 current Radix installables, legacy Toast, Data Table, Date Picker and Typography) and nine Does It ARM compositions. The 1,015 upstream preview entries include 582 Radix docs examples, 252 New York registry examples and sidebar snippets, 67 Nova registry examples, 30 layout blocks, 70 chart blocks, five live site examples, eight archived examples and the legacy Toast demo. The [catalog](../../ui-review/src/catalog.json) and [individual inventories](../../ui-review/src/catalog-data/) identify each exact example.
- The current Cloudflare smoke includes the production-style `/ui` SSR endpoint and assets. Playwright passed the navigation, Accordion, login preview, theme persistence, phone keyboard and both-palette axe checks. Axe covers the gallery shell, atoms and Does It ARM examples. The upstream preview surface is tracked separately in the runtime checks.

## Visual and size evidence

| Live site, dark | UI review, dark |
| --- | --- |
| [Scanner v3, desktop](screenshots/reference-scanner-v3-dark-desktop.png) | [Scanner and app patterns, desktop](screenshots/review-does-it-arm-dark-desktop.png) |
| [Scanner v3, phone](screenshots/reference-scanner-v3-dark-phone.png) | [Scanner and app patterns, phone](screenshots/review-does-it-arm-dark-phone.png) |
| [Homepage, desktop](screenshots/reference-home-dark-desktop.png) | [Atoms, desktop](screenshots/review-atoms-dark-desktop.png) |

Both use the charcoal gradient, gray text and subdued control surfaces. The review adopts the scanner's outlined input and button edges, amber focus ring, green native verdict and muted Rosetta and unknown badges, then applies the same hierarchy to an off-white light palette. The [screenshots](screenshots/) cover all four sections in each palette at both widths.

At the top of the review, headless Chromium reported 19 review assets and 244,489 bytes transferred on each viewport (151,483 encoded JS bytes, 50,566 CSS bytes and 36,740 font bytes, plus request overhead). Compositions load by collection and preview. The default pages reference none of these review assets.

## Local review

`pnpm build:ui` installs the isolated lockfile and generates the review assets. `pnpm dev` then serves `/ui`. Both production build commands run the review build before Astro. Use `PLAYWRIGHT_BROWSER_PATH=/usr/bin/chromium pnpm test:browser` on this machine. `node ui-review/scripts/capture.mjs https://doesitarm.com/ui live` captures the production viewports and reports initial transfer bytes.

## Release verification against `23cd9ff`

- Replayed the review commits onto the latest production master and rebuilt the candidate. Cloudflare's `_astro` assets, sitemap XML and Pagefind index matched the baseline byte for byte. The four local legacy/default route responses matched after applying the normalizations above. The review responded 200 with `X-Robots-Tag: noindex, nofollow`. Its content-addressed JS and CSS have a scoped immutable cache rule.
- The full Netlify build also passed. Netlify SSR returned 200 for the review with the same robots header. Its existing `_astro` assets, search index and sitemaps matched byte for byte, and the same four default SSR responses matched after normalization.
- Vitest passed 400 tests with three existing TODOs on both the baseline and candidate. The baseline's 10 Playwright tests passed on the compiled Cloudflare build. All 13 passed on the candidate, including the original scanner upload modes, Pagefind filtering and the new review tests. The machine's Netlify dev emulator failed to start its Deno edge process, so browser verification used the compiled Cloudflare build.
- Chromium loaded all 1,015 upstream previews at rest. Six upstream code samples had export-looking text inside code strings. The importer now inspects parsed TypeScript exports, and those six previews all passed a targeted retest. The original archive contains eight site/settings previews and the catalog includes the current Base UI RTL demo. The complete parallel Base UI catalog, additional browser engines and every possible upstream interaction remain outside this verification.

## Production

- The [Cloudflare deployment of `de6e6a8`](https://github.com/ThatGuySam/doesitarm/actions/runs/46079693105) succeeded. [`/ui`](https://doesitarm.com/ui) returned 200 with `X-Robots-Tag: noindex, nofollow` and the matching robots meta tag. All three review Playwright tests passed against the live route.
- `/`, `/apple-silicon-app-test`, `/apple-silicon-app-test?v=3`, `/benchmarks` and `/app/nodejs` kept their status, redirect behavior and normalized HTML. The scanner v3 body was byte-identical. The live Pagefind entry matched the build baseline byte for byte. The sitemap refreshed seven URLs already present in the verified `23cd9ff` build baseline and did not include `/ui`.
- The live gallery transferred about 251 kB across 19 initial review requests at each viewport, including about 157 kB of JS, 52 kB of CSS and 37 kB of font data. Captures are available in [desktop dark](screenshots/live-overview-dark-desktop.png), [phone dark](screenshots/live-overview-dark-phone.png), [desktop light](screenshots/live-overview-light-desktop.png) and [phone light](screenshots/live-overview-light-phone.png).
- To remove the route and its build hook, revert `eb82960` on the current master and push the revert through the Cloudflare frontend workflow.

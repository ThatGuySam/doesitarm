# Pagefind Viability For doesitarm

Date: 2026-03-15

## Scope

Investigate whether Pagefind is a good replacement for Stork in `doesitarm`,
given the current Astro 2 + Netlify server build and the existing custom search
pipeline.

## Short Answer

Pagefind is viable for this repo, but not as a drop-in replacement.

The lowest-risk production path today is to keep the Stork fix and ship it.
If `doesitarm` later moves to Pagefind, the right migration path is a
behind-feature-flag prototype using Pagefind's Node API with
`addCustomRecord()`, not a simple `pagefind --site dist` crawl.

## What The Evidence Says

- Current repo shape:
  `doesitarm` builds with `output: "server"` in Astro and only prerenders a
  small subset of routes (`/`, `/categories`, `/games`). Most searchable
  listing pages are SSR routes, not static HTML files in `dist/`.
- Current Stork shape:
  [helpers/stork/toml.js](/Users/athena/Code/doesitarm/helpers/stork/toml.js)
  generates a structured index from sitemap payloads, and
  [components/search-stork.vue](/Users/athena/Code/doesitarm/components/search-stork.vue)
  renders a custom search UI over those records.
- Pagefind official docs:
  the Node API supports `addDirectory()`, `addHTMLFile()`, and
  `addCustomRecord()`. The docs explicitly describe `addCustomRecord()` as a
  way to build an index from non-HTML content.
- Pagefind browser API:
  supports custom JS search UIs, per-result lazy loading with `result.data()`,
  excerpts, filters, and sorting.
- Pagefind latest release:
  `v1.4.0`, published 2025-09-01.
- Relevant GitHub issues:
  `#163` shows Astro + Netlify usage is workable but can need selector/root
  troubleshooting.
  `#198` and `#277` show demand for indexing non-HTML/custom data, which is now
  covered by the Node API docs.
  `#574` remains open for an `npx` wrapper failure on `ubuntu-latest`, which is
  a reason to prefer a pinned dependency and explicit integration over a casual
  CLI-only swap.

## What Works

- Pagefind can support this repo's filters and sorts.
- Pagefind can support a custom UI instead of the stock widget.
- Pagefind can index structured records directly with `addCustomRecord()`,
  which matches `doesitarm` better than crawling built HTML.
- A feature-flagged migration is feasible:
  1. build Pagefind assets from the existing sitemap payload data
  2. expose them under `/pagefind/`
  3. add a Pagefind-backed client alongside the existing Stork component
  4. switch between them with a runtime/build flag

## What To Avoid

- Do not treat Pagefind as a trivial `postbuild` swap in this repo.
  A plain HTML crawl would miss most of the real searchable surface because the
  site is primarily SSR on Netlify.
- Do not attempt the production migration by replacing Stork first and figuring
  out the UI later.
- Do not rely on `npx pagefind` alone in CI without pinning and testing the
  binary/package path on the target image.

## Recommendation

For production now:

1. Ship the Stork Ubuntu 24 fix.
2. Merge that branch to `master`.
3. verify the Netlify deploy is green.

For a Pagefind migration later:

1. Add `pagefind` as a pinned dependency.
2. Create a build script that maps the same sitemap payloads into
   `addCustomRecord()` calls.
3. Write Pagefind output to `static/pagefind/` or `dist/pagefind/`.
4. Add a feature flag that swaps the current Stork client for a Pagefind
   adapter in the search UI.
5. Only remove Stork after the Pagefind path has parity on excerpts, filters,
   and result URLs.

Inference:
Pagefind is probably the cleaner long-term search engine here, but because this
repo already has a data-first indexing pipeline, the migration cost is more
about adapter work than about search quality.

## Source Links

- Pagefind repo:
  https://github.com/Pagefind/pagefind
- Pagefind latest release:
  https://github.com/Pagefind/pagefind/releases/tag/v1.4.0
- Pagefind Node API docs:
  https://pagefind.app/docs/node-api/
- Pagefind browser API docs:
  https://pagefind.app/docs/api/
- Pagefind filtering docs:
  https://pagefind.app/docs/filtering/
- Pagefind sorts docs:
  https://pagefind.app/docs/sorts/
- Pagefind issue `#163`:
  https://github.com/Pagefind/pagefind/issues/163
- Pagefind issue `#198`:
  https://github.com/Pagefind/pagefind/issues/198
- Pagefind issue `#277`:
  https://github.com/Pagefind/pagefind/issues/277
- Pagefind issue `#574`:
  https://github.com/Pagefind/pagefind/issues/574
- HN result set for Pagefind launches:
  https://hn.algolia.com/?q=Pagefind

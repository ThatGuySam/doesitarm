# Pagefind Feature Parity For doesitarm

Date: 2026-03-15

## Scope

Read alongside `docs/research/pagefind-viability-2026-03-15.md`.

Investigate how a Pagefind migration could preserve the current Stork-backed
search UX in `doesitarm`, focusing on user-visible behavior rather than on
whether Pagefind is viable in the abstract.

## Short Answer

Yes, most of the current search experience can be carried over without the user
feeling a major regression, but only if Pagefind is treated as the search core
under a custom Vue adapter.

Recommended parity path:

1. Keep the current server-rendered initial lists, pagination links, summary
   block, and page chrome exactly as they are.
2. Replace only the "user has started searching/filtering" path with Pagefind's
   JavaScript API.
3. Build the Pagefind index from the existing sitemap/listing data, not from an
   HTML crawl.
4. Use Pagefind `filters` for status/category/type scoping.
5. Use Pagefind `meta` only for simple scalar fields needed in result rendering.
6. Reattach richer card UI state such as `searchLinks` from a local
   URL-or-slug keyed map instead of trying to force arrays into Pagefind
   metadata.

The one place where a prototype may still change the implementation choice is
search quality. If `addCustomRecord()` does not rank app-name and alias matches
well enough, the next-best parity option is to generate virtual HTML records via
`addHTMLFile()` so Pagefind can use `h1` weighting and `data-pagefind-*`
attributes.

## Current UX Contract In The Repo

From `components/search-stork.vue`, `helpers/stork/toml.js`, and the scoped
Astro pages:

- The page initially shows the existing paginated list from the API when the
  user has not typed anything yet.
- Search is search-as-you-type, with loading placeholders while results are
  pending.
- The UI exposes quick status chips.
- Scoped pages such as `/kind/...` and `/games` inject base filters so the same
  component behaves like "search within this slice".
- Empty results on a scoped page show a "Search Everything" escape hatch.
- Query results show highlighted snippets and a detail link.
- Non-query cards can also show timestamps and auxiliary action buttons such as
  benchmark/performance links.
- The current Stork index injects synthetic searchable tokens for `status_*`,
  category, and route type, in addition to title/content/description/aliases and
  tags.
- Stork also post-filters query results so every typed term must be present
  somewhere in the returned title/URL/excerpts.

That means parity is not just "can users search", but:

- can they search globally and within a scoped page
- can they click status chips
- can they still get good snippets and stable detail URLs
- can the initial browse mode remain unchanged

## What The Evidence Says

Confirmed from Pagefind docs and repo activity:

- The Node API supports `addCustomRecord()` with `url`, `content`, `language`,
  optional flat `meta`, optional flat `filters`, and optional flat `sort`.
- The Node API also supports `addHTMLFile()` for virtual HTML pages and
  `writeFiles()` / `getFiles()` for writing the bundle to `/pagefind/`.
- The browser API is intended for custom search interfaces, not just the stock
  widget.
- `pagefind.init()` can be called on focus, and `pagefind.preload()` /
  `pagefind.debouncedSearch()` exist specifically to reduce first-search
  latency.
- `result.data()` returns `url`, `excerpt`, `meta`, and related result data.
  The docs explicitly say `excerpt` is safe to use as `innerHTML`, while
  `content` and `meta` are raw.
- The JS API supports filter-only browsing by calling
  `pagefind.search(null, { filters: ... })`.
- The JS API can also return filter counts via `pagefind.filters()`, plus
  remaining-result counts on subsequent searches.
- Filtering defaults to AND semantics, and compound `any` / `all` / `none` /
  `not` logic is available.
- Sorting can be applied at search time, but records missing a sort value are
  omitted when that sort is active.
- Highlighting on destination pages is supported via `highlightParam` and
  `pagefind-highlight.js`.
- Historical GitHub issues `#198` and `#277` asked for direct non-HTML input;
  both are now closed, and the current docs document that capability.
- The latest stable release is `v1.4.0`, published on 2025-09-01.
- Issue `#574` about the `npx` wrapper on `ubuntu-latest` is still open as of
  2026-03-15, so a pinned dependency or direct binary path is safer than a
  casual CLI swap.

Community signal:

- In the main HN discussion for Pagefind's launch, the maintainer explicitly
  said multi-word query merging is built in.
- Another HN commenter reported that deploying Pagefind was "pleasingly easy"
  and the result was "reasonably nippy".
- Zach Leatherman's `pagefind-search` component is a concrete GitHub example of
  treating Pagefind as a customizable UI layer with explicit fallback content
  and controlled asset loading.

## Feature Mapping

| Current user-visible feature | Carry-over path with Pagefind | Confidence | Notes |
| --- | --- | --- | --- |
| Search-as-you-type | `pagefind.debouncedSearch()` or manual debounce + `pagefind.preload()` | High | This is native to the JS API. |
| Lazy first-load behavior | `pagefind.init()` on focus, or rely on first search | High | This matches the current deferred Stork load pattern. |
| Scoped search pages | Keep current initial page data, then call `pagefind.search(term-or-null, { filters })` | High | Better fit than the current synthetic token approach. |
| Quick status chips | Map chips to `filters.status` values | High | Pagefind filters are cleaner than indexing `status_native` into content. |
| Empty-state "Search Everything" | Clear base filters and rerun, or keep current link to `/` | High | User-visible behavior is easy to preserve. |
| Highlighted excerpts | Render `result.data().excerpt` | High | Officially documented and safe as `innerHTML`. |
| Highlighted title text | No first-class JS API equivalent was found in the docs | Medium | Likely plain title unless we add client-side emphasis ourselves. |
| Detail links | Use `result.data().url` | High | Direct match. |
| Relative timestamp text | Put timestamp in `meta`, or join from local listing data | High | `meta` is string-only, so store ISO strings if using metadata. |
| Benchmark / Performance buttons | Join from local listing data keyed by URL or slug | High | Inference: better than encoding arrays as metadata strings. |
| Status / category / type scoping | Use Pagefind `filters`, not fake searchable tokens | High | Cleaner and more explicit than the current Stork trick. |
| "Every typed term must match somewhere" behavior | Likely client-side post-filter using returned raw `content` if needed | Medium | Current Stork behavior is explicit; Pagefind query semantics need a parity check in a prototype. |
| Result ordering that favors app names and aliases | Start with `addCustomRecord()` content shaping; fall back to `addHTMLFile()` if needed | Medium | Custom-record metadata appears display-oriented, not ranking-oriented. |

## Options

### 1. Custom Vue adapter over `addCustomRecord()` output

This is the lowest-risk parity path.

Why it works:

- It matches the repo's existing data-first indexing model.
- It preserves the current page shell and only swaps the query engine.
- It uses Pagefind features the way they are documented today:
  `meta` for display fields, `filters` for scoping, `sort` for explicit sort
  options.

Tradeoffs:

- `meta` is for returned metadata, not clearly for ranking.
- Complex card state such as `searchLinks` does not fit naturally into flat
  string metadata.
- The docs do not show title-highlight ranges in the JS API, so exact title
  highlighting may need custom client logic.

### 2. Custom Vue adapter over generated virtual HTML via `addHTMLFile()`

This is the "higher parity if ranking is off" option.

Why it might be worth it:

- Pagefind documents default weighting for HTML headings.
- Pagefind documents `data-pagefind-weight`, `data-pagefind-meta`,
  `data-pagefind-filter`, and `data-pagefind-sort`.
- If app-name, alias, and status text need finer relevance tuning than a plain
  custom record gives, virtual HTML gives more levers.

Tradeoffs:

- More adapter code.
- Harder to justify unless a real query corpus shows ranking problems.

### 3. Replace the current component with the stock Pagefind UI

Not recommended.

Why:

- It discards the current browse-first behavior and scoped-page behavior.
- It loses the current empty-state copy and action-button treatment.
- It would make parity depend on overriding Pagefind's UI instead of preserving
  the repo's existing search component contract.

## What Works

- Keep "no query" mode exactly as it is today and switch to Pagefind only after
  the user types or toggles a filter.
- Build one Pagefind record per listing/detail route, using the same sitemap
  payloads already feeding the Stork pipeline.
- Put searchable text in `content`, starting with the fields users most expect
  to match: app name, aliases, support text, description, tags, and any status
  phrasing users already see.
- Put render-only scalar fields in `meta`, such as title, slug, status label,
  last-updated ISO timestamp, and short display text.
- Use `filters` for `status`, `category`, `kind`, and other scoped-page
  constraints.
- Build a parallel local result-decoration map keyed by URL or slug so Pagefind
  results can be decorated with the same `searchLinks`, timestamps, or other
  card chrome without turning the index into a transport format for the whole
  listing object.
- Call `pagefind.filters()` once if you want the chip row to expose counts or
  disabled states.

Inference:
For `doesitarm`, this "Pagefind for retrieval + local map for decoration"
split is probably the cleanest way to preserve the current UI without bloating
Pagefind metadata or weakening search semantics.

## What To Avoid

- Do not replace the entire search component with the stock Pagefind UI if the
  goal is parity.
- Do not assume `meta` alone is enough for search quality. Metadata is clearly
  documented as returned result data; searchable content still needs to live in
  `content`.
- Do not try to stuff arrays or nested structures like `searchLinks` into flat
  Pagefind metadata if the same information already exists in local page data.
- Do not apply Pagefind sort options to sparse fields unless every record has a
  value, because missing sort keys are omitted from sorted results.
- Do not assume the `npx pagefind` wrapper is production-safe on Ubuntu CI
  without pinning and testing.

## Recommendation

Recommended implementation order:

1. Keep the current Astro pages and initial list rendering exactly as-is.
2. Build a Pagefind prototype with `addCustomRecord()` from the existing sitemap
   payloads.
3. Map the current scoped-page `baseFilters` to real Pagefind filters.
4. Add a thin Pagefind adapter inside the current Vue component rather than
   replacing the component.
5. Use a local `listingByUrl` or `listingBySlug` map to reattach rich card UI
   fields.
6. Compare a real query set against Stork, especially app-name, alias, and
   multi-term searches.
7. Only if ranking quality is weaker than expected, move the prototype from
   `addCustomRecord()` to generated `addHTMLFile()` records with weighted
   markup.

Why this is the best default:

- It preserves the current user-visible experience in the cheapest way.
- It uses Pagefind features where Pagefind is strongest: retrieval, snippets,
  filtering, counts, and static bundle delivery.
- It avoids forcing Pagefind to become the canonical source of every UI field.

## Missing Information

- I did not find a documented JS API for title highlight ranges equivalent to
  the Stork title-range behavior.
- I did not find clear documentation on exact multi-term query semantics beyond
  Pagefind supporting multi-word queries in practice.
- I did not find a high-signal Stack Overflow thread that added more than the
  official docs for this migration.
- The Lobsters URL surfaced during search no longer resolved, so I did not use
  it as evidence.

## Recommended Next Inspection Steps

1. Build a small Pagefind prototype against 100-200 representative listings.
2. Test 25-50 real queries from the current site vocabulary:
   app names, aliases, status words, category words, and mixed multi-term
   queries.
3. Decide whether status chips should stay effectively single-select, matching
   current behavior, or become explicit OR filters within the same filter key.
4. Verify whether plain title rendering is acceptable, or whether custom
   client-side title emphasis is needed.
5. Measure first-search latency on mobile before removing Stork.

## Source Links

- Pagefind Node API docs:
  https://pagefind.app/docs/node-api/
- Pagefind browser API docs:
  https://pagefind.app/docs/api/
- Pagefind filtering docs:
  https://pagefind.app/docs/filtering/
- Pagefind JS API filtering docs:
  https://pagefind.app/docs/js-api-filtering/
- Pagefind sorting docs:
  https://pagefind.app/docs/sorts/
- Pagefind JS API sorting docs:
  https://pagefind.app/docs/js-api-sorting/
- Pagefind metadata docs:
  https://pagefind.app/docs/metadata/
- Pagefind JS API metadata docs:
  https://pagefind.app/docs/js-api-metadata/
- Pagefind weighting docs:
  https://pagefind.app/docs/weighting/
- Pagefind ranking docs:
  https://pagefind.app/docs/ranking/
- Pagefind highlighting docs:
  https://pagefind.app/docs/highlighting/
- Pagefind sub-results docs:
  https://pagefind.app/docs/sub-results/
- Pagefind latest release `v1.4.0` (published 2025-09-01):
  https://github.com/Pagefind/pagefind/releases/tag/v1.4.0
- Pagefind issue `#198` ("Manually defining content, without passing HTML"):
  https://github.com/Pagefind/pagefind/issues/198
- Pagefind issue `#277` ("Can pagefind pull its data from a json index file?"):
  https://github.com/Pagefind/pagefind/issues/277
- Pagefind issue `#574` (`ubuntu-latest` / `npx` wrapper failure, still open on
  2026-03-15):
  https://github.com/Pagefind/pagefind/issues/574
- HN discussion for Pagefind launch:
  https://news.ycombinator.com/item?id=32290634
- HN item API for the same discussion:
  https://hn.algolia.com/api/v1/items/32290634
- Zach Leatherman's `pagefind-search` web component:
  https://github.com/zachleat/pagefind-search

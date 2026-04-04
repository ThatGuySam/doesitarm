# Original Prompt

> Audit this app for recommend changes from this research ranked by highest leverage. Score each for ease of implementation.
>
> Okay, let's put all of these into a plan. Let's put the easiest to implement towards the top, but also let's include in the plan at every step to research what we're about to do and look for anything helpful, anything that would be helpful for the implementation.

# Goal

Turn `doesitarm` into a stronger public compatibility knowledge product by
improving its discoverability, machine-readable surfaces, and evidence quality,
while keeping the rollout ordered by easiest implementation first and requiring
a fresh research pass before each implementation stage.

# Non-Goals

- Rebuild the entire site or search experience in the first pass.
- Move the full discovery/ingestion pipeline into D1 as part of this plan.
- Publish raw crawls, downloaded binaries, or private operational data.
- Treat `llms.txt` or any single AI-specific surface as the primary strategy.
- Optimize for every possible search feature before the canonical app pages are
  stronger for humans.

# Repo Findings

- App, formula, and game detail pages all flow through the same basic listing
  template:
  [src/pages/app/[...appPath].astro](/Users/athena/Code/doesitarm/src/pages/app/[...appPath].astro),
  [src/pages/formula/[...formulaPath].astro](/Users/athena/Code/doesitarm/src/pages/formula/[...formulaPath].astro),
  [src/pages/game/[...gamePath].astro](/Users/athena/Code/doesitarm/src/pages/game/[...gamePath].astro),
  [src/components/default-listing.astro](/Users/athena/Code/doesitarm/src/components/default-listing.astro).
- Those pages are still closer to status/listing pages than evidence pages.
  The main body currently emphasizes the status line, related links, device
  support, videos, bundles, and a generic last-updated footer, but not a clear
  "how we know" or methodology layer.
- The head system is centralized in
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js),
  but it does not currently emit canonical links and uses generic descriptions
  for listing pages.
- The listing head model is centralized in
  [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js),
  but the current title/description logic is generic and partially hardcoded.
- Structured data support exists, but it is effectively video-only:
  [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js)
  builds JSON-LD for videos and benchmark pages, and
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js)
  only emits JSON-LD for `tv` and `benchmarks` routes.
- The app pages already have a useful public JSON surface under `static/api/`,
  but there is no explicit dataset landing page or formal public snapshot
  surface documented for humans and machines.
- The build already generates sitemaps and a search index:
  [build-lists.js](/Users/athena/Code/doesitarm/build-lists.js).
- `robots.txt` is currently a blanket allow with only a sitemap declaration:
  [static/robots.txt](/Users/athena/Code/doesitarm/static/robots.txt).
- I did not find a checked-in `llms.txt`, `llms-full.txt`, or public plain-text
  / Markdown export surface.

# External Research

- Use
  [docs/research/desktop-app-compatibility-data-strategy-2026-04-04.md](/Users/athena/Code/doesitarm/docs/research/desktop-app-compatibility-data-strategy-2026-04-04.md)
  as the strategy anchor for this plan.
- Google’s current guidance says AI search eligibility still largely depends on
  normal Search fundamentals, which means the public app pages and metadata
  still matter more than any AI-only affordance.
- Google’s helpful-content, spam-policy, and reviews guidance implies that
  thin template pages are risky, while evidence-backed, comparison-friendly, and
  user-helpful pages are more durable.
- OpenAI and Anthropic now expose separate search, training, and user-triggered
  crawlers, which makes bot-specific crawl policy a practical implementation
  surface.
- `llms.txt` and AI-friendly Markdown exports appear useful as secondary
  surfaces, but not as the primary lever.
- Dataset markup is useful only when the site actually publishes a real dataset
  landing page and download surface.

# Decision

Execute this work in ease-first order, not leverage-first order.

Rationale:

- The highest-leverage item is the evidence-page upgrade, but it is not the
  easiest thing to implement cleanly.
- A sequence of smaller early wins can improve crawl quality, metadata, and
  machine-readable surfaces before the larger content-model work lands.
- Each stage should begin with a small research/inspection pass so the
  implementation reflects current docs, current schema requirements, and any
  repo changes that happened after this plan was written.

# Rollout Plan

## 1. Strengthen head metadata and canonical URL support

- Research and confirm:
  review current Astro/head implementation, Google guidance for canonical URLs,
  and whether any existing route types need exceptions before editing the head
  system.
- Implement:
  add canonical links, ensure `og:url` / social URL values use the canonical
  page URL, and upgrade page title/description generation so app pages include
  more useful fact signals than the current generic copy.
- Scope:
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js),
  [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js),
  and the page entrypoints that feed `headOptions`.
- Stop condition:
  the site emits canonical links and noticeably better per-page metadata without
  changing page structure yet.

## 2. Add a public methodology layer and improve source labeling on app pages

- Research and confirm:
  review Google’s helpful-content and review-style guidance again, then inspect
  the current app page layout to identify the smallest meaningful “how we know”
  addition that improves user trust without requiring a full template rewrite.
- Implement:
  add a methodology page or methodology section, link to it from app pages, and
  stop hiding source context behind generic labels such as `View`.
- Implement:
  expose clearer source/evidence language on app pages, especially around:
  official source, verification source, last verified, and update/report flows.
- Scope:
  [src/components/default-listing.astro](/Users/athena/Code/doesitarm/src/components/default-listing.astro),
  [src/components/listing-parts/related-links.astro](/Users/athena/Code/doesitarm/src/components/listing-parts/related-links.astro),
  [src/components/listing-parts/last-updated.astro](/Users/athena/Code/doesitarm/src/components/listing-parts/last-updated.astro),
  plus a new methodology page in `src/pages/`.
- Stop condition:
  every app page has a clearer “how we know” path even before the full
  evidence-page upgrade lands.

## 3. Add a bot-policy matrix and update crawl controls

- Research and confirm:
  re-check current OpenAI and Anthropic crawler docs plus any search-engine bot
  requirements immediately before changing crawler policy.
- Implement:
  define the intended policy for:
  `Googlebot`, `OAI-SearchBot`, `GPTBot`, `ChatGPT-User`,
  `Claude-SearchBot`, `ClaudeBot`, and `Claude-User`.
- Implement:
  update `robots.txt` accordingly and add a short repo-local note documenting
  the reasoning so the bot policy is not rediscovered from scratch later.
- Scope:
  [static/robots.txt](/Users/athena/Code/doesitarm/static/robots.txt) and a
  small supporting doc under `docs/` or `docs/plans/`.
- Stop condition:
  the site has explicit AI/search crawler policy rather than a wildcard default.

## 4. Add `llms.txt` and a lightweight plain-text export surface

- Research and confirm:
  review the latest `llms.txt` / `llms-full.txt` conventions and current
  examples before implementing anything. Re-check whether there are now better
  conventions for docs maps, plain-text exports, or per-page Markdown.
- Implement:
  add a minimal `llms.txt` that points to the most useful public surfaces:
  homepage, categories, methodology, dataset/download page, and canonical app
  surfaces.
- Implement:
  decide the smallest useful plain-text export surface:
  either a global `llms-full.txt`, a compact machine-readable summary, or a
  small number of high-value Markdown/text views.
- Scope:
  `static/` and whichever build helpers are needed to produce a stable
  low-cost text surface.
- Stop condition:
  the project exposes a minimal AI-friendly discovery surface without yet
  attempting a full text-export architecture.

## 5. Expand structured data beyond videos

- Research and confirm:
  re-read current Google structured-data docs and Schema.org guidance before
  implementation to avoid stale or invalid markup assumptions.
- Implement:
  remove the current “video-only emit” restriction from the head system where
  appropriate and add truthful app-level structured data for app, formula, and
  game pages.
- Implement:
  keep markup aligned with visible page content. Do not invent commerce fields
  or unsupported review fields just to chase rich results.
- Scope:
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js),
  [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js),
  [helpers/structured-data.js](/Users/athena/Code/doesitarm/helpers/structured-data.js),
  plus tests around structured-data output.
- Stop condition:
  app-like pages emit valid, truthful JSON-LD, while video pages keep their
  existing structured-data support.

## 6. Publish a dataset/download surface

- Research and confirm:
  re-check Google Dataset guidance, `Dataset` / `DataDownload` expectations,
  and practical licensing/provenance requirements before publishing anything as
  a dataset.
- Implement:
  add a dataset landing page that explains what can be downloaded, how often it
  updates, what fields are included, and how the data should be cited or used.
- Implement:
  promote one or more existing JSON outputs into formal public snapshot assets,
  and decide whether CSV should also be emitted in the first pass.
- Scope:
  [build-lists.js](/Users/athena/Code/doesitarm/build-lists.js), new pages in
  `src/pages/`, and any helper code needed to expose a stable snapshot surface.
- Stop condition:
  the site offers a real public dataset entrypoint instead of only implicit API
  files.

## 7. Upgrade canonical app pages from status pages to evidence pages

- Research and confirm:
  inspect the live app-page composition, compare it with the research memo’s
  recommendations, and review any new examples of strong evidence-heavy product
  or compatibility pages before rewriting the template.
- Implement:
  extend app pages so they include a clearer evidence summary, environment
  distinctions, verification method, source attribution, and a more explicit
  “what changed” or “status history” path where data exists.
- Implement:
  define the smallest new content blocks that materially increase usefulness:
  status summary, evidence summary, environment/workaround summary, and change
  notes.
- Scope:
  [src/components/default-listing.astro](/Users/athena/Code/doesitarm/src/components/default-listing.astro)
  plus new listing-part components and any supporting listing helpers.
- Stop condition:
  the canonical app pages answer more of the real user question than the
  current template does.

## 8. Reduce index bloat and make indexing intentional

- Research and confirm:
  re-read Google crawling/indexing guidance before touching indexability rules,
  especially around internal search, faceted navigation, and low-value pages.
- Implement:
  decide which surfaces should remain indexable by default:
  canonical app pages, category pages, dataset pages, and high-intent
  comparison pages.
- Implement:
  identify low-value or confusing surfaces that may need `noindex`, canonical
  consolidation, or sitemap exclusion.
- Scope:
  [build-lists.js](/Users/athena/Code/doesitarm/build-lists.js),
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js),
  search/category pages, and any sitemap/index-generation helpers.
- Stop condition:
  the site’s crawl/index policy reflects page value instead of “everything is
  indexable because it exists.”

# Validation Gates

- Metadata/canonical stage:
  inspect page source for `/`, one `/app/...`, one `/formula/...`, one
  `/game/...`, and one `/tv/...` page and confirm canonical plus improved title
  and description output.
- Methodology/source-label stage:
  manually review one app page and confirm that evidence/source links are more
  legible and that a methodology path is present.
- Bot-policy stage:
  validate generated `robots.txt` content against the intended bot matrix and
  confirm the file still advertises the sitemap.
- `llms.txt` stage:
  fetch and inspect the generated files and confirm they point to live public
  surfaces that are actually useful.
- Structured-data stage:
  extend or unskip structured-data tests and validate one app page plus one
  video page.
- Dataset stage:
  confirm the landing page exists, download links work, and the documented
  schema matches the shipped snapshot fields.
- Evidence-page stage:
  manually review several representative pages:
  native app, non-native app, formula, and game.
- Index-bloat stage:
  inspect page source, sitemap output, and any `noindex` directives to confirm
  only intended pages are affected.
- End-to-end gate:
  `pnpm build`
  `pnpm test`
  plus manual review of rendered HTML on representative routes.

# Deliverables

- A repo-local implementation plan in
  [public-discoverability-and-dataset-plan.md](/Users/athena/Code/doesitarm/docs/plans/public-discoverability-and-dataset-plan.md)
- Improved page metadata and canonical handling
- A methodology surface linked from public pages
- An explicit crawler-policy matrix and updated `robots.txt`
- `llms.txt` and a lightweight AI-friendly text surface
- App-level structured data beyond videos
- A dataset/download landing page and public snapshot surface
- Stronger evidence-oriented app pages
- A more intentional indexing strategy

# Risks And Open Questions

- Ease-first order is not identical to leverage-first order. The plan delays the
  largest content-model improvement so smaller foundation changes can land
  first.
- The current public JSON shape may not be sufficient for a strong evidence-page
  upgrade without adding new derived fields or exposing more of the existing
  data model.
- Bot-policy decisions are partly product decisions, not only technical ones.
  The safest implementation is not necessarily the best business decision.
- `llms.txt` conventions are still moving, so the implementation should remain
  lightweight and easy to change.
- Dataset publication raises questions about license, attribution, rate limits,
  and whether CSV/Parquet should be included now or later.
- Structured data can easily drift away from visible page truth if the page
  templates and data model are not upgraded together.
- Search/category pages may currently be valuable enough to keep indexed; the
  “index bloat” stage needs traffic and usefulness review before it removes
  anything from search.

# Sources

- [docs/research/desktop-app-compatibility-data-strategy-2026-04-04.md](/Users/athena/Code/doesitarm/docs/research/desktop-app-compatibility-data-strategy-2026-04-04.md)
- [src/pages/app/[...appPath].astro](/Users/athena/Code/doesitarm/src/pages/app/[...appPath].astro)
- [src/pages/formula/[...formulaPath].astro](/Users/athena/Code/doesitarm/src/pages/formula/[...formulaPath].astro)
- [src/pages/game/[...gamePath].astro](/Users/athena/Code/doesitarm/src/pages/game/[...gamePath].astro)
- [src/components/default-listing.astro](/Users/athena/Code/doesitarm/src/components/default-listing.astro)
- [src/components/listing-parts/related-links.astro](/Users/athena/Code/doesitarm/src/components/listing-parts/related-links.astro)
- [src/components/listing-parts/last-updated.astro](/Users/athena/Code/doesitarm/src/components/listing-parts/last-updated.astro)
- [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js)
- [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js)
- [helpers/structured-data.js](/Users/athena/Code/doesitarm/helpers/structured-data.js)
- [build-lists.js](/Users/athena/Code/doesitarm/build-lists.js)
- [static/robots.txt](/Users/athena/Code/doesitarm/static/robots.txt)

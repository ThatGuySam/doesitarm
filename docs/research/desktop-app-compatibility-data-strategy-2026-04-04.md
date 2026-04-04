# Desktop App Compatibility Data Strategy For doesitarm

Tease: In 2026, the winning play is not "AI SEO." It is publishing a high-trust, machine-readable compatibility corpus that is genuinely useful on the open web and selectively keeping the operational and proprietary layers private.

Lede: For `doesitarm` on 2026-04-04, the best-fit strategy is to treat the site as an entity-and-evidence graph for desktop software compatibility: publish canonical app pages, provenance-rich evidence, structured exports, and selective machine-readable surfaces for discovery; keep raw crawls, binary artifacts, candidate matches, scoring logic, and operational intelligence private.

Why it matters:
- This project can outlive the Apple Silicon transition if the core model is "desktop software compatibility knowledge," not just "Apple Silicon list posts."
- Google's 2025 AI search guidance still rewards the same fundamentals: unique content, crawlable pages, textual clarity, and trustworthy evidence, not special AI-only tricks.
- OpenAI and Anthropic now expose separate search, user-action, and training bots, which means "open versus closed" is no longer binary. You can choose visibility, training access, and operational exposure separately.

Go deeper:
- Think of the public site as a citation layer and decision-support layer, not as the full warehouse.
- Publish public facts, provenance, timestamps, and curated exports. Keep raw ingestion, low-confidence candidates, and monetizable workflow intelligence private.
- Treat `llms.txt` and Markdown exports as helpful secondary surfaces, not as the core strategy. The core strategy is still clean HTML, canonical URLs, structured data, sitemaps, and useful pages.

Date: 2026-04-04

## Scope

Research how to think about a long-lived desktop app compatibility database as a
content, SEO, and AI-discoverability system in 2026, including:

- best practices for public content architecture
- how LLM-driven discovery changes the picture
- what data should likely stay public versus private
- what audiences this data can serve
- tradeoffs between more-open and more-closed approaches

## Short Answer

Build `doesitarm` as a public knowledge product with a private operating system
underneath it.

Publicly, publish:

- canonical app pages
- compatibility status by platform/environment
- evidence summaries and source links
- timestamps, changelogs, and history
- stable IDs, taxonomy, and machine-readable metadata
- a limited public API or snapshot exports for high-value reuse

Privately, keep:

- raw crawls and downloaded binaries
- candidate entities before review
- normalization, dedupe, and confidence logic
- crawler logs, abuse rules, and infrastructure controls
- enrichment that creates monetizable leverage rather than user value on the open web

The biggest strategic shift from 2018 to 2026 is this:

1. Search still rewards useful original pages.
2. AI discovery mostly rides on those same pages.
3. Separate crawler controls now let you be open for search while staying more closed for training.
4. The moat is less "having any compatibility data at all" and more:
   verification quality, provenance, freshness, historical depth, and workflow speed.

Inference:
No single source states that exact four-part conclusion. It is the synthesis that
best fits the repo state plus current Google, OpenAI, Anthropic, Cloudflare,
HN, and Lobsters evidence.

## What The Repo Already Knows

- The project already acts like a compatibility corpus, not just a blog:
  [README.md](/Users/athena/Code/doesitarm/README.md) is a manually curated,
  source-linked compatibility list.
- The repo already has a plan to move toward a canonical database and discovery
  pipeline:
  [docs/plans/app-discovery-d1-automation.md](/Users/athena/Code/doesitarm/docs/plans/app-discovery-d1-automation.md).
- The public site already exposes crawlable pages, a sitemap, and permissive
  crawling:
  [static/robots.txt](/Users/athena/Code/doesitarm/static/robots.txt),
  [static/sitemap-index.xml](/Users/athena/Code/doesitarm/static/sitemap-index.xml).
- The current public JSON already exposes useful app-level fields such as name,
  aliases, status, bundle IDs, related links, scan details, and device support:
  [static/api/app/spotify.json](/Users/athena/Code/doesitarm/static/api/app/spotify.json).
- The current structured data implementation is narrow and video-centric:
  [helpers/structured-data.js](/Users/athena/Code/doesitarm/helpers/structured-data.js),
  [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js),
  [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js).
- I did not find a checked-in `llms.txt`, `llms-full.txt`, or per-page Markdown
  export surface.
- I also did not find `SoftwareApplication` or `Dataset` structured data on app
  or dataset pages.

Inference:
`doesitarm` already has enough public data shape to become a strong
machine-readable corpus. The main gap is not "inventing the dataset." The gap is
formalizing and publishing the right layers of it.

## What The Evidence Says

### 1. Google AI search still wants normal SEO fundamentals, not special AI tricks

Google's current AI-features guidance says there are no extra technical
requirements for AI Overviews or AI Mode beyond normal Search eligibility.
Google explicitly says you do not need new AI files or special schema just to
appear in AI features.

What does matter:

- crawl access
- internal links
- page experience
- important content in textual form
- structured data matching visible text
- unique, non-commodity content

This is the strongest argument against building an "AI discoverability" strategy
around gimmicks alone.

### 2. Large-scale thin template pages are a real risk

Google's helpful-content and spam-policy guidance is directly relevant to
programmatic compatibility sites:

- people-first content is favored
- pages made mainly to attract search visits are a warning sign
- scaled content abuse includes generating many low-value pages, including from
  feeds or automated transformations

That means a compatibility database can absolutely win in search, but only if
its pages add decision-making value. Thin pages that just restate a status field
are dangerous.

### 3. Compatibility content should look more like tested reviews than like directory filler

Google's reviews guidance is a good proxy for compatibility pages because users
often arrive with a purchase, migration, or workflow decision in mind.

The guidance consistently rewards:

- original research
- first-hand evidence
- quantitative measurements where relevant
- comparisons
- what changed across versions
- benefits and drawbacks

For `doesitarm`, that maps cleanly onto:

- status by environment
- last verified date
- evidence links
- scanner output or screenshots where appropriate
- "what changed" changelog notes
- comparison pages like native vs Rosetta vs virtualization vs cloud workaround

### 4. Dataset markup is useful, but it should describe real dataset landing pages

Google's dataset documentation recommends canonical landing pages plus dataset
metadata such as `sameAs`, `isBasedOn`, identifiers, license, and download
distribution metadata.

That is a strong fit for curated exports such as:

- a public daily or weekly compatibility snapshot
- a historical archive by date
- vendor- or category-specific exports
- a Windows-on-ARM or future-transition slice later on

Important nuance:
Google's dataset docs are about Dataset Search discovery, not a substitute for
general web SEO. Dataset markup helps when you actually publish datasets.

### 5. `SoftwareApplication` markup fits the entity model, but Google rich-result requirements are narrower

Schema.org's `SoftwareApplication` type supports fields that are very relevant
here, including:

- `applicationCategory`
- `downloadUrl`
- `featureList`
- `operatingSystem`
- `softwareRequirements`
- `softwareVersion`
- `supportingData`

Google also has a software-app structured-data feature, but its rich-result
requirements are more commerce-shaped, including `offers.price` and
review/rating support. That means:

- use `SoftwareApplication` semantics where they match the visible page truth
- do not invent store-like fields just to chase rich results
- use dataset markup for exports and software/entity markup for canonical app
  pages

### 6. AI discoverability is now bot-by-bot, not one global yes/no

OpenAI and Anthropic both now distinguish between different AI access modes.

OpenAI:

- `OAI-SearchBot` is for search inclusion
- `GPTBot` is for training
- `ChatGPT-User` is for user-triggered actions

Anthropic:

- `ClaudeBot` is for training
- `Claude-SearchBot` is for search quality
- `Claude-User` is for user-triggered retrieval

This is strategically important. You no longer need to choose only between:

- fully public for every AI purpose
- fully blocked for every AI purpose

You can allow discovery while disallowing training, or allow search while
tightly managing user-action access, depending on your goals.

### 7. `llms.txt` is real, but it is still a secondary signal

Cloudflare has implemented `llms.txt`, `llms-full.txt`, and per-page Markdown
exports, and Simon Willison has highlighted similar docs-map patterns as useful
for agent tooling.

That said:

- Google explicitly says no special AI text files are required for AI features
- OpenAI's discoverability guidance focuses on crawler access, `noindex`, and
  citation/linking, not `llms.txt`
- HN and Lobsters discussions show real skepticism around AI crawler incentives
  and how consistently emerging conventions are respected

Best interpretation:

- `llms.txt` is worth adding because it is cheap and increasingly recognized
- it should not be treated as the core lever
- the core lever is still strong public pages plus clean machine-readable
  content

### 8. AI-friendly plain-text and Markdown surfaces do have practical value

Cloudflare's docs work here is the clearest practical example:

- per-page Markdown versions
- an index file
- bulk text export
- semantic HTML
- `noindex` on low-value or confusing pages

This is less about search ranking and more about:

- making retrieval cheaper and more accurate for agents
- improving citation quality
- reducing token waste
- giving your own future agents and partners a stable ingest format

For a compatibility corpus, that suggests public Markdown or JSON exports are
worth doing for the canonical facts layer.

### 9. Freshness and URL discovery matter more as the corpus grows

Google recommends sitemaps and Search Console monitoring.
IndexNow gives faster change pings for engines that support it, including Bing.

For a frequently updated compatibility corpus, this argues for:

- canonical landing pages
- clean sitemap generation
- changelog feeds or update streams
- optional IndexNow support for faster non-Google discovery

### 10. The crawl environment is getting more adversarial

Cloudflare Radar reported AI and search crawling growth of 18% from May 2024 to
May 2025 across its measured cohort, with `GPTBot` up 305%.
HN and Lobsters operator discussions show why this matters in practice:

- some AI crawlers create real infrastructure cost
- incentives are less aligned than classic web search
- operators increasingly need bot-specific controls, rate limiting, and
  selective exposure

This is the best evidence for keeping raw and high-cost surfaces private even if
you lean more open on the public facts layer.

## Ways This Data Can Create Value

### Human audiences

- End users deciding whether they can keep using a favorite app on new hardware.
- IT, procurement, and upgrade planners deciding when a transition is safe.
- Developers and vendors tracking native support gaps and competitive pressure.
- Journalists and analysts covering platform transitions.
- Researchers and historians studying how ecosystems adapt to hardware changes.

### Machine audiences

- Search engines indexing canonical app, category, and comparison pages.
- LLM search products citing your pages as evidence.
- RAG systems consuming public snapshots or APIs.
- Agents answering migration, procurement, or troubleshooting questions.
- Internal `doesitarm` automation using the same canonical public layer as a
  stable reference surface.

### Business-model value

- Audience growth from high-intent compatibility queries.
- Affiliate or sponsored monetization on truly decision-support pages.
- Paid APIs, bulk exports, or enterprise dashboards.
- Vendor intelligence and alerting.
- Historical transition data as a differentiated research asset.

Inference:
The public facts are likely to commoditize over time. The durable value is the
combination of breadth, freshness, provenance, history, and tooling layered on
top of those facts.

## What Should Likely Stay Public

Public-by-default fields:

- stable app identifier and canonical URL
- app name, aliases, vendor, category, platform family
- compatibility status by environment
- environment dimensions such as CPU architecture, OS family/version, native
  vs translation vs virtualization
- bundle IDs and installer/package metadata where safe and user-useful
- last verified date, first seen date, last changed date
- public evidence summary and source links
- changelog summary for status changes
- category and comparison pages built from real user tasks
- curated JSON, CSV, or Parquet snapshot exports
- public structured data and sitemaps

Public page types that seem high-value:

- canonical app pages
- category pages
- "best alternatives if not native yet" pages
- transition pages such as "best native DAWs on Apple Silicon"
- comparison pages by use case, hardware generation, and workaround path
- dataset landing pages for bulk exports

## What Should Likely Stay Private

Private-by-default fields:

- raw crawled HTML and downloaded ZIP/DMG/PKG artifacts
- extracted binaries and quarantine samples
- low-confidence matches and candidate entities
- dedupe, normalization, and scoring heuristics
- reviewer notes, moderation notes, and dispute state
- crawler logs, IP intelligence, WAF rules, and abuse signatures
- affiliate economics, contact records, outreach state, and deal terms
- internal confidence models, embeddings, and experimental feature engineering
- unpublished source mappings and scrape recipes that are costly to build

Why keep these private:

- operational risk
- legal and hosting risk
- abuse resistance
- clearer moat
- lower copyability

## Different Ways To Think About The Database

### 1. Directory / programmatic SEO system

Upside:
- fastest traffic growth if executed well

Downside:
- easiest to drift into thin pages and scaled-content abuse
- weakest long-term moat

Use this frame only if every template answers a real question better than a
generic directory would.

### 2. Public knowledge graph with evidence

Upside:
- strongest fit for search, citations, and trust
- best long-term reuse across Apple, Windows, and future transitions

Downside:
- requires stronger data modeling and provenance discipline

This is the best framing for `doesitarm`.

### 3. Public publication layer over a private intelligence system

Upside:
- best balance of discoverability and defensibility
- easiest path to enterprise/API products later

Downside:
- more operational complexity

This is the recommended operating model.

### 4. Mostly closed database with selective public summaries

Upside:
- strongest direct control over assets

Downside:
- weakest SEO and AI discoverability
- hardest to build brand authority from the data itself

This makes sense only if monetization depends more on closed workflows than on
being the public authority.

## Open Vs Closed Strategy Options

## Option 1. Open facts, private operations

Publish:

- canonical pages
- evidence summaries
- limited exports
- structured data

Keep private:

- raw ingestion
- candidate pipeline
- scoring and ops

Tradeoff:
Best overall balance of discoverability, trust, and defensibility.

## Option 2. Open pages, paid API / paid bulk data

Publish:

- strong pages for discovery and citations
- free lightweight API or delayed snapshots

Charge for:

- real-time API
- higher limits
- historical depth
- enterprise filters and alerts

Tradeoff:
Strong monetization path, but requires clearer product packaging.

## Option 3. Fully open data commons

Publish:

- everything except unsafe raw binaries/secrets

Tradeoff:
Maximum goodwill, citation, and reuse.
Minimum moat unless monetization shifts to services, sponsorship, or community
leadership.

## Option 4. Selective access / crawler monetization layer

Publish:

- normal web pages

Control:

- which bots crawl
- whether training is allowed
- whether some crawlers must pay

Tradeoff:
Promising middle path, especially as crawler monetization standards mature, but
still early and not something to build the whole strategy around yet.

## Recommendation

For `doesitarm`, use Option 1 now, with a path to Option 2 later.

Concretely:

1. Treat the database as transition-agnostic.
   Use dimensions like `platform_family`, `cpu_arch`, `translation_layer`,
   `virtualization_layer`, `os_version`, `artifact_type`, and
   `verification_method` so the same model can cover Apple Silicon, Windows on
   ARM, or the next Apple transition.

2. Build a public canonical facts layer.
   Each app should have a canonical page with:
   status, environments, timestamps, evidence links, and short synthesis.

3. Build a public dataset layer.
   Publish periodic snapshots with dataset landing pages, license, provenance,
   versioning, and download metadata.

4. Keep ingestion and raw evidence private.
   Store raw downloads, scrape traces, matching logic, and low-confidence
   candidates outside the public repo and public site.

5. Add public machine-readable surfaces in this order:
   - `SoftwareApplication`-style entity markup where it truthfully matches page content
   - dataset landing pages plus `Dataset` / `DataDownload` metadata for exports
   - stable JSON or CSV snapshots
   - `llms.txt` and Markdown exports as secondary aids

6. Make public pages citation-friendly.
   Add clear authorship, methodology, "how we know", last verified date, and
   source links.

7. Avoid index bloat.
   Keep canonical entity and high-intent comparison pages indexable.
   Use `noindex` or crawl controls for low-value filter permutations and stale
   or confusing pages.

8. Measure before deciding how open to be.
   Track:
   - Search Console web traffic
   - ChatGPT referral traffic via `utm_source=chatgpt.com`
   - bot traffic by user agent
   - crawl cost versus referral value

Inference:
The best long-term moat is not withholding all facts. It is being the most
trusted and most reusable source for those facts, while keeping the expensive
and differentiating machinery private.

## Near-Term Next Steps For doesitarm

1. Add a public data-contract document describing the canonical app entity,
   environment entity, evidence entity, and snapshot dataset.
2. Expand app pages from "status page" to "evidence page":
   include methodology, last verified date, change history, and source
   attribution.
3. Add structured data intentionally:
   entity markup for app pages, dataset markup for exports, not generic markup
   everywhere.
4. Add a public snapshot export and a dataset landing page.
5. Add a bot-policy matrix to `robots.txt` planning:
   Google search, OpenAI search, Anthropic search, training bots, and user bots.
6. Add `llms.txt` only after the public canonical and export layers are clean.
7. Keep filters/search-result pages from becoming the primary indexable surface.

## Source Links

- Repo context:
  - [README.md](/Users/athena/Code/doesitarm/README.md)
  - [docs/plans/app-discovery-d1-automation.md](/Users/athena/Code/doesitarm/docs/plans/app-discovery-d1-automation.md)
  - [static/robots.txt](/Users/athena/Code/doesitarm/static/robots.txt)
  - [helpers/structured-data.js](/Users/athena/Code/doesitarm/helpers/structured-data.js)
  - [helpers/listing-page.js](/Users/athena/Code/doesitarm/helpers/listing-page.js)
  - [helpers/config-node.js](/Users/athena/Code/doesitarm/helpers/config-node.js)
  - [static/api/app/spotify.json](/Users/athena/Code/doesitarm/static/api/app/spotify.json)

- Google AI features and AI search:
  - https://developers.google.com/search/docs/appearance/ai-features
  - https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search
  - https://developers.google.com/search/docs/fundamentals/creating-helpful-content
  - https://developers.google.com/search/docs/essentials/spam-policies
  - https://developers.google.com/search/docs/fundamentals/using-gen-ai-content

- Google review and structured-data guidance:
  - https://developers.google.com/search/docs/appearance/reviews-system
  - https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews
  - https://developers.google.com/search/docs/appearance/structured-data/software-app
  - https://developers.google.com/search/docs/appearance/structured-data/dataset
  - https://developers.google.com/search/docs/appearance/structured-data/sd-policies
  - https://developers.google.com/search/docs/crawling-indexing/crawling-managing-faceted-navigation
  - https://developers.google.com/search/docs/crawling-indexing/block-indexing

- Schema and dataset modeling:
  - https://schema.org/SoftwareApplication

- OpenAI:
  - https://help.openai.com/en/articles/12627856-publishers-and-developers-faq
  - https://help.openai.com/en/articles/9237897-chatgpt-search
  - https://platform.openai.com/docs/gptbot

- Anthropic:
  - https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
  - https://docs.anthropic.com/en/docs/build-with-claude/search-results

- Cloudflare:
  - https://developers.cloudflare.com/style-guide/how-we-docs/ai-consumability/
  - https://blog.cloudflare.com/from-googlebot-to-gptbot-whos-crawling-your-site-in-2025/
  - https://blog.cloudflare.com/introducing-pay-per-crawl/

- Discovery and freshness:
  - https://www.indexnow.org/index

- Practitioner and discussion context:
  - https://simonwillison.net/2025/Oct/24/claude-code-docs-map/
  - https://news.ycombinator.com/item?id=41072549
  - https://lobste.rs/s/dmuad3/mitigating_sourcehut_s_partial_outage

## Source Quality Notes

- Google Search Central, OpenAI, Anthropic, Schema.org, IndexNow, and Cloudflare
  were the primary sources for current guidance.
- The HN and Lobsters links were useful for operator sentiment and failure modes,
  not as primary authority for ranking behavior.
- `llms.txt` appears real and increasingly implemented, but the strongest
  current evidence still says it is supplemental rather than foundational.

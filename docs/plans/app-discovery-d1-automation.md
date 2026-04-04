# Original Prompt

> Let's start a draft plan in docs/plans to get the app to a place where we can pull in these app data from sources automaically.
>
> We'll need to migrate all the existing and new data from Google Sheets to Cloudflare D1.
>
> We'll need to setup and run the app discovery pipeline locally on this machine.
>
> We'll need to test if we can get the app canner to be isomorphic so that we can scan from both node/bun and the browser.
>
> We'll need to audit and fix the pending app compatibility issue for the scanner.
>
> We'll need to setup an automated app discovery either on GitHub Actions or Cloudflare.
>
> Read through our docs and let me know any other work we need to add to this list

# Goal

Get Does It ARM to a local-first, automatable app discovery and scan pipeline that uses Cloudflare D1 as the canonical data store, can be run on this machine, can backfill legacy data from Google Sheets and other current feeds, can later run on a scheduler without breaking the existing site build, and lives inside a maintainable public monorepo with explicit app, package, database, and infrastructure boundaries.

# Non-Goals

- Rebuild the frontend or replace Astro/Netlify in the first pass.
- Automate every source class on day one.
- Force full browser and Node/Bun archive parity before the feasibility spike is complete.
- Remove the manual README/list flow before D1-backed equivalents exist.
- Switch package manager/runtime just because the inspiration repo uses Bun.

# Repo Findings

- There is already one scanner-focused plan in `docs/plans/app-test-typescript-refactor.md`, but it is narrower than this request and mainly covers Playwright safety rails plus incremental TypeScript conversion.
- The repo is still organized as a flat root with mixed app, build, worker, helper, and infra concerns rather than as a workspace monorepo.
- The app-test UI lives in `pages/apple-silicon-app-test.vue` and is mounted by `src/pages/apple-silicon-app-test.astro`.
- There are two scanner surfaces today:
- `helpers/app-files-scanner.js` is the legacy path still used by the page by default.
- `helpers/scanner/scan.ts`, `helpers/scanner/client.ts`, and `helpers/scanner/worker.ts` implement the newer worker-based scanner exposed behind `?version=2`.
- Browser coverage already exists for both scanner variants in `test/playwright/apple-silicon-app-test.playwright.ts`.
- That browser coverage is not currently green in local execution: on April 4, 2026, `pnpm exec vitest run --config vitest.playwright.config.mjs test/playwright/apple-silicon-app-test.playwright.ts` timed out waiting for the Astro dev server.
- Worker-scanner coverage already exists in `test/scanner/client.test.ts`.
- The site build still assembles static output from remote/env-backed sources rather than a local database:
- `helpers/build-app-list.js` reads `COMMITS_SOURCE`, `SCANS_SOURCE`, and `VFUNCTIONS_URL`.
- `helpers/build-homebrew-list.js` reads `HOMEBREW_SOURCE`.
- `helpers/build-game-list.js` reads `GAMES_SOURCE`.
- `helpers/build-device-list.js` reads `VFUNCTIONS_URL`.
- `build-lists.js` composes the generated app, game, homebrew, device, and video outputs from those inputs.
- `scripts/scan-new-apps.js` is not a working discovery pipeline yet. It has `runScans = false`, exits on Linux, and only spins up a local server stub.
- The repo has Cloudflare deployment automation, but not app-level D1 plumbing in source control. `.github/workflows/deploy-cloudflare-workers.yml` deploys `doesitarm-default/` and `workers/analytics/`, and writes Wrangler config from GitHub secrets at CI time.
- That same Cloudflare workflow currently prints secret-derived `.env` and `wrangler.toml` files to CI logs, which should be treated as an immediate security fix.
- There is a local `.env` with the current runtime contract, but there is no checked-in bootstrap/setup doc for another machine or another session.

# External Research

- Read alongside `docs/research/public-repo-security-and-monorepo-patterns-2026-04-04.md`.
- The Notion research backlog repeatedly describes the target ingestion loop as: discover source page or asset URL, download the archive, recursively extract ZIP/DMG/PKG contents, find the `.app` or Mach-O payload, scan architecture/metadata, and persist results.
- Notion still points to Homebrew as a primary source class. `Download and scan Homebrew Casks` and `Source from Homebrew Casks URLs` emphasize starting with ZIPs, then DMGs, then known extensions, while filtering already-known/native apps, batching releases, and adding timeouts/retries.
- Additional documented source classes include generic download pages, GitHub app lists and release assets, Mac App Store data, Product Hunt, Nix, and MacPorts.
- The newer `Data Source Priorities` note from May 8, 2024 still lists `Homebrew Cask Scans`, `Homebrew Formulae API`, `App Scans`, and `Product Hunt Apps/API` as important sources.
- Notion’s App Test notes map closely to the repo’s current scanner work: archive URL submission, download-page scanning, recursive extraction, and writing scan data to a store.
- I did not find explicit Playwright or agent-browser planning in Notion. That looks like a newer execution approach layered on top of the older source-discovery research rather than a documented historical plan.
- The new security/monorepo research recommends keeping the repo public, keeping secrets and raw operational data private, using a Kriasoft-style `apps/` + `packages/` + `db/` + `infra/` layout, defaulting GitHub Actions to read-only tokens and GitHub-hosted runners, and avoiding privileged `pull_request_target` flows that checkout PR code.

# Recommendation

- Make D1 the canonical store for discovered apps, source observations, scan runs, and site-facing aggregated records.
- Refactor toward a Kriasoft-style public monorepo before adding more discovery and infra code to the flat root. Adapt the layout, not the entire toolchain.
- Keep the repo public, but keep secrets, raw imports, downloaded archives, quarantine material, and privileged operational state private.
- Add a public-repo security-hardening stage before expanding automation: remove secret logging, tighten GitHub Actions permissions, guard workflow/infra/db paths with `CODEOWNERS`, ignore local secret/state files, and keep public CI on GitHub-hosted runners.
- Stage the work in this order: monorepo target and boundaries, public-repo security hardening, data model and D1 migration contract, scanner stabilization, local discovery pipeline, D1-backed read-path migration, then scheduled automation.
- Keep the scan core runtime-agnostic where feasible, but do not block delivery on proving identical browser and Node/Bun support for every archive type. If DMG/PKG support is impractical in the browser, make that an explicit server-side fallback instead of an accidental limitation.
- Use GitHub Actions as the first scheduled runner because the repo already has scheduled workflows and no committed D1/Wrangler local workflow yet. Keep Cloudflare as the longer-term execution target if a D1-bound ingestion worker becomes the canonical runtime.

# Rollout Plan

1. Define the monorepo target and carve the repository into stable boundaries.
- Design the target workspace layout in the style of `kriasoft/react-starter-kit`, adapted to the current pnpm repo:
- `apps/web/` for the Astro site and app-test UI
- `apps/default-worker/` and `apps/analytics-worker/` for current Cloudflare workers
- `apps/discovery/` for discovery/ingest entry points if a dedicated app surface is warranted
- `packages/scanner-core/`, `packages/source-runners/`, `packages/data-model/`, and `packages/site-build/` for shared logic
- `db/` for D1 migrations, seeds, import scripts, and local DB helpers
- `infra/` for Wrangler config, deployment helpers, and infra policy docs
- Keep the package manager as pnpm unless a later decision explicitly changes it.
- Decide which existing root paths move first so the refactor stays reviewable and does not block all feature work at once.

2. Establish the public-repo security baseline before adding more automation.
- Remove secret printing from CI and rotate any secrets that may have been exposed in logs.
- Adopt a public template env pattern:
- commit a placeholder-only `.env.example` or equivalent template
- keep real credentials in ignored local files and secret managers
- ignore `.env.local`, `.dev.vars`, `.wrangler/`, and other new local-secret/state paths introduced by D1/Workers work
- Set the default `GITHUB_TOKEN` posture to read-only and grant additional permissions per job only where needed.
- Add `CODEOWNERS` or equivalent review protection for `.github/workflows/`, `infra/`, and `db/`.
- Prefer GitHub-hosted runners for public CI and scheduled jobs; do not use self-hosted runners for public PR workflows.
- Add or enable repository security defaults suitable for public OSS: secret scanning, push protection, private vulnerability reporting, dependency review, and workflow/action pinning policy.

3. Define the source-of-truth data model and migration contract.
- Inventory every current sheet/feed that contributes app, scan, bundle, device, game, and Homebrew data.
- Define D1 tables for apps, app versions, bundles, source types, source observations, discovered assets, scan runs, import jobs, and sync checkpoints.
- Define provenance and dedupe rules for slug, bundle ID, download URL, version string, scan hash, source type, and timestamps like `first_seen_at` and `last_seen_at`.
- Write a field-mapping document from Google Sheets and current remote JSON feeds into the D1 schema.
- Decide which current static outputs remain derived snapshots and which should become D1-backed runtime/API reads.
- Add Wrangler/D1 project config, migrations, and local/staging/prod database environments.
- Build import scripts for existing Google Sheets data and any current remote feeds that must be preserved for continuity.
- Add validation output for import counts, duplicate merges, and skipped/error records.
- Document the local bootstrap on this machine: required env keys, auth/setup steps, migration commands, import commands, and reset/rollback commands.

4. Stabilize the scanner and resolve the pending compatibility issue.
- Identify the concrete pending scanner compatibility issue, capture a reproducible sample or fixture, and turn it into an automated regression test.
- Audit the legacy `helpers/app-files-scanner.js` path against the worker scanner in `helpers/scanner/*` and decide the deprecation/default path.
- Expand scanner fixtures beyond the current happy-path native ZIP to include Intel-only, malformed, nested, DMG, and PKG examples where legally redistributable.
- Decide whether “isomorphic scanner” means one shared scan core with environment-specific file loaders or truly identical archive support in browser and Node/Bun.
- If full parity is not practical, document and test the split: browser handles `.app` and `.zip`; Node/Bun handles heavier formats like `.dmg` and `.pkg`.

5. Build the local app discovery pipeline.
- Implement a bounded CLI or script entry point that can run locally on this machine and execute source discovery, download, extraction, scan, and D1 persistence end to end.
- Start with the highest-value documented sources: Homebrew Casks and Homebrew source URLs, then GitHub releases/lists, then generic download pages.
- Normalize all source runners into one contract: source page -> discovered asset URLs -> fetched artifact -> extracted app candidates -> scan result -> persisted record.
- Add rate limiting, retry/backoff, timeout, file-size guards, duplicate suppression, and quarantine/error buckets for failed downloads or unsupported archives.
- Persist per-run audit data so reruns can skip already-processed successes and focus on failures or changed sources.

6. Move site and build reads onto D1-backed interfaces.
- Replace or wrap the current remote feed dependencies (`SCANS_SOURCE`, `HOMEBREW_SOURCE`, `GAMES_SOURCE`, `VFUNCTIONS_URL`, `PUBLIC_API_DOMAIN`) with D1-backed queries or exported snapshots generated from D1.
- Define how App Test submissions and automated discovery scans appear on app pages, listings, and API outputs without duplicate records.
- Introduce compatibility adapters so the site can cut over source-by-source instead of all at once.
- Verify whether any normalization currently lives behind the existing remote endpoints and port that logic before removing those dependencies.

7. Add scheduled automation and operational controls.
- Choose the first scheduler architecture:
- GitHub Actions if the job mostly runs scripts or triggers a small ingestion endpoint.
- Cloudflare if a D1-bound worker becomes the canonical ingestion runtime.
- Add a staging/dry-run lane before production writes.
- Emit run summaries for discovered apps, downloaded assets, successful scans, failed scans, D1 writes, duplicates skipped, and retries exhausted.
- Add pause/resume controls per source plus playbooks for reruns, backfills, and bad-import recovery.
- If Cloudflare becomes the later execution target, evaluate Workflows/Queues plus Workers Logs/Traces as the durable background-processing and observability surface.

# Validation Gates

- Monorepo scaffolding is internally consistent:
- workspace install succeeds
- shared packages resolve from the intended workspace paths
- moved apps still build from their new locations
- Security baseline changes are reviewed and verified:
- CI no longer prints secret-derived config to logs
- workflow permissions are explicitly declared
- protected paths (`.github/workflows/`, `infra/`, `db/`) have review ownership
- Existing scanner coverage passes:
- `pnpm exec vitest run test/scanner/client.test.ts`
- `pnpm exec vitest run --config vitest.playwright.config.mjs test/playwright/apple-silicon-app-test.playwright.ts`
- Site/build health passes after read-path changes:
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- Migration validation artifact exists and is reviewed:
- source row counts vs D1 row counts
- duplicate/merge report for slugs, bundle IDs, versions, and scan hashes
- sample record spot checks across apps, scans, Homebrew, devices, and games
- Local discovery dry run succeeds against a bounded batch:
- at least 10 Homebrew apps
- at least 3 non-Homebrew direct-download pages
- persisted run summary saved to a reviewable artifact
- Automation validation succeeds in staging:
- one scheduled run completes
- rerunning the same batch is idempotent
- no uncontrolled duplicate writes are produced

# Deliverables

- A repo-local execution plan in `docs/plans/app-discovery-d1-automation.md`
- A repo-local research memo in `docs/research/public-repo-security-and-monorepo-patterns-2026-04-04.md`
- A target monorepo layout and migration sequence for the current flat-root repo
- A public-repo security baseline for workflows, secrets, and local operational state
- D1 schema and migration design
- Local bootstrap documentation for discovery plus D1
- Import/backfill scripts and validation report shape
- Scanner audit and regression-coverage plan
- Local discovery pipeline plan and runnable entry point
- Scheduled automation decision with staging rollout path

# Risks And Open Questions

- The pending scanner compatibility issue is not named in repo docs, so the first task in that stage is to identify the exact failing app/archive and capture it as a test case.
- Browser-safe DMG/PKG support may not be realistic. Forcing parity could delay delivery more than an explicit split runtime.
- The monorepo refactor can easily sprawl if it tries to move every surface at once; the first slice should focus on boundaries that unblock scanner, D1, and discovery work.
- The current site mixes manual README content, build-time remote feeds, and app-test scan data. The D1 cutover boundary needs an explicit decision.
- Generic site downloads and third-party source scraping need a clear policy for rate limits, robots/TOS, timeouts, and file-size caps.
- Existing remote endpoints may contain normalization logic that is not visible in this repo. That logic has to be audited before those feeds are replaced.
- Cloudflare deployment exists today, but D1 local/prod workflow is not checked in. Local reproducibility depends on adding that missing surface.
- Cloudflare deployment may continue to require long-lived tokens in GitHub Actions even after hardening, so environment scoping and review gates matter.
- If the worker scanner becomes default, the legacy scanner should not remain as an unowned fallback indefinitely.

# Sources

- `docs/research/public-repo-security-and-monorepo-patterns-2026-04-04.md`
- `docs/plans/app-test-typescript-refactor.md`
- `docs/app-flow.md`
- `build-lists.js`
- `helpers/build-app-list.js`
- `helpers/build-homebrew-list.js`
- `helpers/build-game-list.js`
- `helpers/build-device-list.js`
- `helpers/app-files-scanner.js`
- `helpers/scanner/scan.ts`
- `helpers/scanner/client.ts`
- `test/playwright/apple-silicon-app-test.playwright.ts`
- `test/scanner/client.test.ts`
- `.github/workflows/deploy-api.yaml`
- `.github/workflows/deploy-cloudflare-workers.yml`
- `.github/workflows/deploy-frontend.yaml`
- `.github/workflows/deploy-functions.yaml`
- Notion: Download and scan Homebrew Casks
- Notion: Source from Homebrew Casks URLs
- Notion: Source from generic App/Download page links
- Notion: App Tester
- Notion: Get App Test Working in Node
- Notion: Detect and decompressed ZIP, DMG, and PKG
- Notion: Data Source Priorities

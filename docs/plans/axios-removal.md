# Original Prompt

> How much refactoring would it be to remove axios?
>
> Make a plan file for this.

# Goal

Remove `axios` from the repo without breaking CI, production deploys, app
scanning, or the current API/build flows, while replacing it with one shared,
testable HTTP layer instead of many ad hoc call-site rewrites.

## 2026-04-06 Progress Update

- Completed end-to-end migration of the in-scope call sites to
  `helpers/http.js`.
- Added and tested shared HTTP helper:
  - `helpers/http.js` (new)
  - `test/prebuild/http.test.ts` (new)
- `package.json` no longer lists `axios`.
- Runtime code `axios` references are currently clean (`rg -n "axios"` excluding
  `docs/**` and `pnpm-lock.yaml` returns no hits).
- Validation completed in this pass:
  - `pnpm run -s typecheck` ✅
  - `pnpm -s run test-prebuild` ✅
  - `pnpm -s run test` ✅
  - `pnpm -s run test:browser` ✅
  - `pnpm -s run lint` ❌ (existing repo-wide lint issues unrelated to axios migration)
- Remaining to close out final gate from this plan:
  - execute `pnpm run netlify-build` ✅
  - run live deploy verification (`apple-silicon-app-test` URLs) ✅
  - confirm whether `pnpm-lock.yaml` changes are sufficient for your lockfile policy
    - ✅ `package.json` no longer lists axios
    - ✅ `pnpm-lock.yaml` still contains only transitive `gaxios` (Google API client dependency), no direct `axios` entry

# Non-Goals

- Replace every network call with raw `fetch` inline at each call site.
- Change product behavior just to simplify the transport layer.
- Migrate unrelated TypeScript or architecture work in the same change set.
- Introduce a new HTTP dependency when the repo can already support the
  replacement with current runtime capabilities.

# Repo Findings

- `axios` is referenced in `19` files across the repo.
- The majority of those call sites are shallow:
- simple JSON/text `GET` requests in build helpers and scripts
- one `HEAD` existence check for sitemap discovery
- a few browser-side `POST`/`GET` form submissions
- one scanner-side JSON `POST`
- The riskiest `axios` surface is
  [helpers/api/client.js](/Users/athena/Code/doesitarm/helpers/api/client.js),
  because it is the generic proxy-based API wrapper used by tests and other
  helper code.
- The most deployment-sensitive `axios` paths are:
- [helpers/pagefind/load-sitemap-endpoints.ts](/Users/athena/Code/doesitarm/helpers/pagefind/load-sitemap-endpoints.ts)
- [scripts/build-pagefind-index.js](/Users/athena/Code/doesitarm/scripts/build-pagefind-index.js)
- [helpers/api/sitemap/parse.js](/Users/athena/Code/doesitarm/helpers/api/sitemap/parse.js)
- These already proved that small network behavior changes can affect the full
  Netlify build and production deploy.
- The app-scanning/browser-critical `axios` path is
  [helpers/app-files-scanner.js](/Users/athena/Code/doesitarm/helpers/app-files-scanner.js),
  where scan submission posts to `TEST_RESULT_STORE`.
- Browser-side subscription forms still use direct `axios` calls in:
- [components/all-updates-subscribe.vue](/Users/athena/Code/doesitarm/components/all-updates-subscribe.vue)
- [components/email-subscribe.vue](/Users/athena/Code/doesitarm/components/email-subscribe.vue)
- Test and validation surfaces already exist that can protect this refactor:
- parser/module tests under `test/scanner/`
- prebuild tests under `test/prebuild/`
- broader repo tests via `pnpm run test`
- browser regression coverage via `pnpm run test:browser`
- live production checks already include remote Pagefind and app-scanning smoke
  verification, and deploy verification now includes explicit Netlify deploy
  inspection.
- The repo already depends on `ofetch`, but it is not used anywhere today.
- Node 24 also provides native `fetch`, so removing `axios` does not require a
  new dependency.

# Recommendation

Remove `axios` in stages behind one small shared HTTP helper instead of
replacing each call site with custom `fetch` logic.

Preferred implementation direction:

- add a repo-local HTTP helper built on native `fetch`
- keep helper methods narrow and explicit:
- `getJson`
- `getText`
- `postJson`
- `headOk`
- optional retry wrapper only where external build inputs justify it
- migrate the most deployment-sensitive build callers first, then browser/API
  callers, and only migrate the generic proxy client last

Rationale:

- native `fetch` reduces dependency surface and works in Node 24 plus browsers
- one helper preserves consistent error handling and retry policy
- the helper can be unit tested directly, which fits the repo’s new
  small-test-first verification preference

# Rollout Plan

1. Add the shared HTTP helper and direct unit coverage. ✅
- Create a small helper module under `helpers/` that wraps native `fetch`. ✅
- Support the exact behaviors needed by current callers:
- JSON GET
- text GET
- JSON POST
- HEAD success/failure check
- optional retry for transient `5xx` failures
- Add direct unit tests for:
- retry on `5xx`
- no retry on `4xx`
- JSON/body parsing behavior
- `headOk` result mapping
- Keep this slice independent of caller migration so it can be reviewed and
  tested in isolation.

2. Migrate deploy- and build-sensitive callers first. ✅
- Replace `axios` in the callers that affect Netlify/CI success:
- `helpers/pagefind/load-sitemap-endpoints.ts`
- `scripts/build-pagefind-index.js`
- `scripts/download-sitemaps.js`
- `helpers/api/sitemap/parse.js`
- `helpers/api/static.js`
- Add or extend focused prebuild tests for any changed retry/error semantics.
- Verify with `pnpm run test-prebuild` before broader test runs. ✅

3. Migrate data-fetching build helpers. ✅
- Replace `axios` in:
- `helpers/build-app-list.js`
- `helpers/build-homebrew-list.js`
- `helpers/build-game-list.js`
- `helpers/build-device-list.js`
- `helpers/api/youtube/build.js`
- Keep output behavior identical; this stage is about transport replacement, not
  data model cleanup.
- Validate with:
- `pnpm run test` ✅
- `pnpm netlify-build` ✅

4. Migrate browser-side form and scanner callers. ✅
- Replace `axios` in:
- `helpers/app-files-scanner.js`
- `components/all-updates-subscribe.vue`
- `components/email-subscribe.vue`
- Preserve current UX semantics:
- success/failure messages
- request payload shapes
- request methods
- Re-run:
- `pnpm run test:browser` ✅
- production app-scanning smoke against both app-test routes ✅

5. Migrate the generic API proxy wrapper last. ✅
- Replace `axios` in
  [helpers/api/client.js](/Users/athena/Code/doesitarm/helpers/api/client.js)
  only after the lower-risk callers are green. ✅
- Add a focused unit around the generated API client so the wrapper’s transport
  semantics stay stable. ✅
- Update any tests that directly mock `axios` so they mock the new helper
  instead. ✅

6. Remove `axios` from the repo.
- Remove `axios` from
  [package.json](/Users/athena/Code/doesitarm/package.json). ✅
- Do a final grep to confirm no runtime code imports remain. ✅
- Re-run the full repo validation and live deploy verification. ✅

# Execution Order For This Pass

1. Add `helpers/http.js` with direct unit tests that lock:
- JSON GET parsing
- text GET parsing
- JSON POST payload + response handling
- `HEAD` success/failure mapping
- retry on `5xx` but not on `4xx`

2. Migrate the already-tested sitemap/pagefind caller path first.
- `helpers/pagefind/load-sitemap-endpoints.ts`
- `test/prebuild/load-sitemap-endpoints.test.ts`

3. Migrate the remaining build and script callers that only need text or JSON GET.
- `scripts/download-sitemaps.js`
- `helpers/api/static.js`
- `helpers/api/sitemap/parse.js`
- `helpers/build-*.js`
- `helpers/api/youtube/build.js`
- `scripts/scan-new-apps.js`
- `scripts/vercel-post-deploy/index.js`

4. Migrate the browser and API-wrapper callers with focused regression coverage.
- `helpers/app-files-scanner.js`
- `components/all-updates-subscribe.vue`
- `components/email-subscribe.vue`
- `helpers/api/client.js`
- `test/listings/index.test.ts`

5. Remove `axios` from dependency and lockfile after grep is clean.

# Validation Gates

- Shared HTTP helper stage:
- direct unit tests for helper behavior
- `pnpm run typecheck`

- Build/prebuild migration stages:
- `pnpm run test-prebuild`
- `pnpm run typecheck`
- `pnpm netlify-build`

- Browser/scanner migration stages:
- `pnpm run test`
- `pnpm run test:browser`
- production smoke against:
- `https://doesitarm.com/apple-silicon-app-test/`
- `https://doesitarm.com/apple-silicon-app-test/?version=2`

- Final removal gate:
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run test-prebuild`
- `pnpm run test:browser`
- inspect the latest Netlify deploy via CLI/API and confirm the production
  deploy reaches `ready`

# Deliverables

- A repo-local axios removal plan in `docs/plans/axios-removal.md`
- A shared HTTP helper with direct tests
- Smaller migration commits by caller category
- Updated tests that no longer depend on mocking `axios`
- Removal of `axios` from runtime dependencies

# Risks And Open Questions

- The generic proxy client in `helpers/api/client.js` may hide assumptions about
  request config and returned error shape.
- Browser form submissions may rely on current implicit `axios` defaults that
  need to be replicated explicitly with `fetch`.
- Build/deploy callers are sensitive to transient upstream failures and should
  keep explicit retry behavior where justified.
- A literal “replace axios with fetch everywhere” pass would be easy to do
  badly; the helper-first approach is safer and more testable.
- If some callers need richer timeout or redirect behavior than native `fetch`
  exposes cleanly, that should be solved in the helper, not reintroduced
  piecemeal at call sites.

# Sources

- `package.json`
- `helpers/api/client.js`
- `helpers/api/static.js`
- `helpers/api/sitemap/parse.js`
- `helpers/pagefind/load-sitemap-endpoints.ts`
- `helpers/app-files-scanner.js`
- `helpers/build-app-list.js`
- `helpers/build-homebrew-list.js`
- `helpers/build-game-list.js`
- `helpers/build-device-list.js`
- `helpers/api/youtube/build.js`
- `components/all-updates-subscribe.vue`
- `components/email-subscribe.vue`
- `scripts/build-pagefind-index.js`
- `scripts/download-sitemaps.js`
- `scripts/scan-new-apps.js`
- `test/listings/index.test.ts`
- `test/prebuild/load-sitemap-endpoints.test.ts`

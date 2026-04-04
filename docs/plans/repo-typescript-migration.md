# Original Prompt

> Let's fix the cloudflare.
>
> I also want to completely refactor this repo to TypeScript without breaking CI.
>
> Do we have a full e2e test for App Scanning?

# Goal

Move the repo from a mostly JavaScript codebase to a TypeScript-first codebase without breaking CI, production deploys, or the existing app-scanning behavior, while keeping each migration slice small enough to review and roll back.

# Non-Goals

- Rewrite the whole repo to TypeScript in one commit.
- Change scanner or site behavior just to satisfy typing.
- Replace Astro, Vue, pnpm, or Netlify/Cloudflare as part of the migration itself.
- Force every legacy worker/helper package onto modern tooling before the type migration proves out.

# Repo Findings

- The repo is still overwhelmingly JavaScript-led:
- 195 code files across `.ts`, `.js`, `.mjs`, `.vue`, and `.astro`
- 12 TypeScript files, about 6.2% of code files
- 1,802 TypeScript lines out of 20,721 total code lines, about 8.7% by line count
- The scanner/app-test surface is now the strongest typed foothold in the repo:
- `helpers/scanner/client.ts`
- `helpers/scanner/scan.ts`
- `helpers/scanner/worker.ts`
- `test/scanner/client.test.ts`
- The browser harness is already typed and now protects the main app-scanning flow:
- `test/playwright/apple-silicon-app-test.playwright.ts`
- `test/playwright/pagefind-native-filter.playwright.ts`
- App-scanning coverage is strong for the happy path, but not exhaustive:
- There is a real browser upload E2E for both the legacy scanner and the worker scanner via `?version=2`.
- That test stubs the result-store POST, so it is not a full database/backend integration test.
- There is a direct worker-scanner test using a generated `.app.zip` fixture.
- Negative fixtures and heavier archive cases like DMG/PKG are still missing.
- The page layer still uses JavaScript/Vue options API in `pages/apple-silicon-app-test.vue`, even though the scanner internals beneath it are now typed.
- The repo has mixed runtime shapes:
- old `.js` helper modules
- some `.mjs` server/build modules
- `.vue` and `.astro` files with little or no embedded TypeScript
- Cloudflare worker subprojects under `doesitarm-default/` and `workers/analytics/` still use old JavaScript toolchains and should be treated as separate migration surfaces.

# Decision

Do the migration as a staged refactor with explicit CI gates after each slice. Keep the scanner/app-test lane as the proving ground, then expand outward to helper/build modules, then UI/runtime surfaces, then worker subprojects. Prefer converting boundary-stable modules first and avoid cross-repo churn until tests and deploys stay green.

# Rollout Plan

1. Lock the migration baseline and CI contract.
- Treat `pnpm run typecheck`, `pnpm run test`, and `pnpm run test:browser` as the minimum green gate for repo-level migration slices.
- Keep production smoke checks for app scanning and Pagefind in the validation ladder when changes touch scanner, app-test, or search.
- Do not merge large TypeScript batches without passing the same gates that currently protect production deploys.

2. Finish the scanner-adjacent TypeScript lane before broadening scope.
- Convert the remaining scanner internals and helper modules that sit directly below the typed worker surface:
- `helpers/scanner/parsers/macho.js`
- `helpers/scanner/parsers/plist.js`
- `helpers/scanner/file-api.js`
- Add negative scanner fixtures alongside the existing happy-path test:
- decompression failure
- missing `Info.plist`
- missing Mach-O
- non-native architecture result
- Keep the app-test browser E2E green for both the default path and `?version=2`.

3. Make the worker scanner the default path, then delete the legacy scanner.
- Switch the app-test page to use the typed worker scanner path by default.
- Keep the browser test protecting the route while that cutover happens.
- Once the default path is stable, remove the old `helpers/app-files-scanner.js` legacy implementation rather than maintaining two divergent scanner stacks.
- This is the biggest simplification available before broader TypeScript conversion.

4. Convert runtime config, URL, and shared helper modules.
- Migrate shared helper modules that are reused by pages and builds but have relatively stable behavior:
- `helpers/public-runtime-config.mjs`
- `helpers/url.js`
- `helpers/check-types.js`
- `helpers/environment.js`
- `helpers/config-node.js`
- Prefer module-by-module conversion with targeted regression coverage instead of umbrella “helpers” commits.

5. Convert build and list-generation modules in bounded slices.
- Move the build pipeline from mixed `.js`/`.mjs` to typed modules in sequence:
- list builders (`helpers/build-*.js`)
- API/static builders
- scripts under `scripts/`
- `build-lists.js`
- Keep `pnpm netlify-build` as the main verification gate for this stage, because these modules affect the deploy artifact more than the browser UI.

6. Convert Vue and Astro surfaces after their underlying helpers are typed.
- Start with high-risk pages that already have browser tests:
- `pages/apple-silicon-app-test.vue`
- search surfaces touched by the Pagefind regression
- Then move into other Vue components and Astro pages incrementally.
- Avoid converting large groups of Vue components in one pass unless they share the same typed props/state model.

7. Migrate the Cloudflare worker subprojects as a separate workstream.
- Treat `doesitarm-default/` and `workers/analytics/` as isolated packages with their own runtime/toolchain constraints.
- Convert them after the main site/scanner path is stable.
- Keep their CI/deploy workflow green independently of the main Astro site migration.

# Validation Gates

- For scanner/app-test changes:
- `pnpm run typecheck`
- `pnpm exec vitest run test/scanner/client.test.ts`
- `pnpm run test:browser`
- production smoke on `https://doesitarm.com/apple-silicon-app-test/`

- For helper/build changes:
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm netlify-build`

- For search-related changes:
- `pnpm run typecheck`
- `PLAYWRIGHT_BASE_URL=https://doesitarm.com pnpm run test:browser:pagefind`

- For worker-subproject changes:
- the relevant worker install/build path still succeeds
- the Cloudflare deploy workflow remains green

# Deliverables

- A staged TypeScript migration plan in `docs/plans/repo-typescript-migration.md`
- A bounded migration order that preserves CI and production safety
- A rule for when it is safe to remove the legacy scanner path
- Expanded scanner fixture coverage beyond the current native happy path
- A clear split between main-site migration work and Cloudflare worker migration work

# Risks And Open Questions

- The fastest way to “convert everything” would create too much churn and likely destabilize CI; the staged path is slower but safer.
- Browser-safe archive support may continue to diverge from Node/Bun-safe archive support for formats like DMG and PKG.
- Legacy helper modules may hide runtime assumptions that only show up in the full Netlify build path.
- Vue options-API files can become noisy when typed mechanically; they should be migrated only after props/state boundaries are clear.
- The Cloudflare subprojects use older JS tooling and may need their own migration plan if they resist the main repo conventions.
- “100% TypeScript” may not be worth pursuing literally for generated glue or tiny legacy worker entrypoints if the last few files cost more risk than value.

# Sources

- `docs/plans/app-test-typescript-refactor.md`
- `docs/plans/app-discovery-d1-automation.md`
- `test/playwright/apple-silicon-app-test.playwright.ts`
- `test/scanner/client.test.ts`
- `helpers/scanner/client.ts`
- `helpers/scanner/scan.ts`
- `helpers/scanner/worker.ts`
- `pages/apple-silicon-app-test.vue`

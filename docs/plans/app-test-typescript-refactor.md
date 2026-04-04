# Original Prompt

> OK, this is really great. I've been wanting to do a TypeScript conversion for this repo for a while. Tell me about that. We also need to... I want-- we have a-- the app test feature. Every time I try to touch that code, it gets fragile. So build a playwright test to verify that feature so that way we can scan apps, and then get that working. and then let's start a refactor. But once you have that working and verified, Let's start to refactor to get this converted all to TypeScript.

# Goal

Lock the Apple Silicon app-test flow with an end-to-end browser test, fix regressions in the real scan/upload path, and begin the TypeScript conversion with small, reviewable changes around the browser-test and scanner surface.

# Non-Goals

- Full repo-wide JavaScript-to-TypeScript conversion in one pass.
- Replacing the scan engine implementation without test coverage first.
- Changing user-facing app-test behavior beyond what is needed to make the feature reliable.

# Repo Findings

- The app-test UI is implemented in [pages/apple-silicon-app-test.vue](/Users/athena/Code/doesitarm/pages/apple-silicon-app-test.vue) and mounted by [src/pages/apple-silicon-app-test.astro](/Users/athena/Code/doesitarm/src/pages/apple-silicon-app-test.astro).
- The current browser-test harness exists, but only covers Pagefind in [test/playwright/pagefind-native-filter.playwright.js](/Users/athena/Code/doesitarm/test/playwright/pagefind-native-filter.playwright.js).
- The app-test flow depends on archive extraction, plist parsing, Mach-O parsing, and an HTTP POST to `TEST_RESULT_STORE` via [helpers/app-files-scanner.js](/Users/athena/Code/doesitarm/helpers/app-files-scanner.js).
- A newer worker-based scanner path exists behind `?version=2`, but the production page still defaults to the legacy path.

# Decision

Add a deterministic Playwright upload test that scans a generated zipped `.app` bundle against the real page, stub only the remote result-store POST, and use that as the safety rail before starting TypeScript refactors.

# Rollout Plan

1. Add typed Playwright support for spinning up Astro and generating a known-good app archive fixture.
2. Add a browser test for `/apple-silicon-app-test/` that uploads the fixture, intercepts the result-store request, and asserts the rendered native result.
3. Fix app-test regressions exposed by the browser test.
4. Start the TypeScript conversion with the new Playwright support layer and continue into the scanner path in later passes.

# Validation Gates

- `pnpm test:browser test/playwright/apple-silicon-app-test.playwright.ts`
- `pnpm test:browser`
- Manual smoke check of `/apple-silicon-app-test/` if the browser test exposes timing or hydration issues

# Deliverables

- A Playwright browser test covering the app-test upload and scan flow
- Any app-test fixes required to make that test pass
- Initial TypeScript refactor scaffolding in the browser-test/scanner-adjacent path

# Risks And Open Questions

- The legacy scanner depends on zip and Mach-O parsing behavior in the browser, so fixture choice needs to stay minimal and deterministic.
- The repo still mixes `.js`, `.mjs`, `.ts`, `.vue`, and `.astro`, so conversion order matters; scanner-adjacent modules should move only after coverage exists.
- The worker-based scanner path likely needs separate follow-up coverage before it can replace the legacy path.

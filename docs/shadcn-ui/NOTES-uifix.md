# UI review fixes (2026-11-27)

Fixes for the independent review of /ui. Newest entries last.

## 1. Build isolation

- The production build commands no longer run `build:ui`. `generate-astro` and `generate-astro:cloudflare` are plain Astro builds again, so the site deploy cannot fail because of ui-review.
- `scripts/build-ui-isolated.mjs` builds into `.ui-build-tmp/` and replaces `static/ui-assets/` only when the build succeeds. On failure it prints a warning, keeps the previous assets and exits 1.
- The Cloudflare workflow restores `static/ui-assets` from the Actions cache (key = hash of `ui-review/**`), skips the build on an exact hit, runs the build with `continue-on-error: true` otherwise, and saves the cache only when the build succeeded. A failed build serves the last good assets from the `ui-assets-` prefix, or answers 503 on /ui when there never was one.
- Pinned `ai` 7.0.184, `@ai-sdk/react` 4.0.189 and `shadcn` 4.23.1 (stable, no canary or latest). The lockfile resolves the remaining caret ranges.

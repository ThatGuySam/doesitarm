# UI review fixes (2026-11-27)

Fixes for the independent review of /ui. Newest entries last.

## 1. Build isolation

- The production build commands no longer run `build:ui`. `generate-astro` and `generate-astro:cloudflare` are plain Astro builds again, so the site deploy cannot fail because of ui-review.
- `scripts/build-ui-isolated.mjs` builds into `.ui-build-tmp/` and replaces `static/ui-assets/` only when the build succeeds. On failure it prints a warning, keeps the previous assets and exits 1.
- The Cloudflare workflow restores `static/ui-assets` from the Actions cache (key = hash of `ui-review/**`), skips the build on an exact hit, runs the build with `continue-on-error: true` otherwise, and saves the cache only when the build succeeded. A failed build serves the last good assets from the `ui-assets-` prefix, or answers 503 on /ui when there never was one.
- Pinned `ai` 7.0.184, `@ai-sdk/react` 4.0.189 and `shadcn` 4.23.1 (stable, no canary or latest). The lockfile resolves the remaining caret ranges.

## 2-8. Look and accessibility fixes

- Tokens measured on the live classic site at 1440 px (`--classic-*` in `ui-review/theme.css`): pill button 34 px tall, 10 px radius, 15 px text, transparent with a 2 px transparent border and the four-layer inset shadow; badge 25 px, full radius, `rgba(255,255,255,.2)`; input 32 px, 7.5 px radius, `#191a1d`, neumorphic shadow. Verified on the local /ui: button 34/10/15, badge 25/15, input 32/7.5/15.
- The scanner v3 look is kept as `data-look="scanner"` on any ancestor; the Button, Badge and Input atoms show both looks.
- Default badge is a muted pill; outline and destructive are outlined. Solid orange and pink appear only in the scanner look. Verdict colours stay in the Does It ARM compositions.
- Font: the Inter web font is removed. The stack is the site's exact one: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Collection and Composition selects use the inset input background (axe colour-contrast). The builder's axe test now scrolls to #compositions, waits for both selects and the frame, and no longer excludes the frame.
- Deep links re-align on every height change until the reader scrolls (4 s cap), and the compositions block reserves its height. Local check: `#does-it-arm` lands 80 px below the viewport top at 1440 and 106 px at 390.
- Atom grid uses `align-items: start`. Atom disclosures read "Official examples for <component>" to assistive tech. `prefers-reduced-motion` now zeroes all animation and transition durations inside the scope.
- /ui HTML sends `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=600` (503 sends no-store). The window is short because a deploy replaces the hashed assets.

## Known upstream axe issues (shadcn examples, all cards open)

The shell passes axe. The official examples, excluded from the shell audit (`.review-live-demo`), fail nine rules upstream: `aria-input-field-name`, `aria-progressbar-name`, `aria-required-children`, `button-name`, `color-contrast` (code-block syntax colours), `label-content-name-mismatch` (calendar day buttons), `label` (OTP input), `scrollable-region-focusable`, `select-name`. They live in the vendored shadcn examples and are not patched here.

## 9. React Aria accordion

Not added. It is a separate variant with its own dependency set, so it is not trivial; listed here as open.

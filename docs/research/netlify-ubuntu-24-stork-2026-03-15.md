# Netlify Ubuntu 24 Stork Migration

Date: 2026-03-15

## Scope

Investigate why `doesitarm` fails on Netlify's Noble/Ubuntu 24 image and
identify whether the fix belongs in this repo or `../doesitarm-functions/`.

## Short Answer

The failing production build is blocked in the Stork setup stage, not in Astro
or the companion functions repo.

The immediate break is that `doesitarm` downloads Stork's
`stork-ubuntu-20-04` binary, which is linked against `libssl.so.1.1`. Netlify's
Noble/Ubuntu 24 image no longer ships that library, so the binary exits before
Astro starts building.

There is also a separate Node 22 regression in this repo: `isBrowserContext()`
uses `navigator` to detect browsers, but Node 22 exposes a global
`navigator`. That causes Node processes on macOS to be misdetected as browser
contexts and pushes local Stork downloads onto the Linux binary path.

## What The Evidence Says

- Confirmed from the user-provided Netlify build log:
  `./stork-executable: error while loading shared libraries: libssl.so.1.1`
- Confirmed from the latest Stork release metadata:
  `v1.6.0` ships both `stork-ubuntu-20-04` and `stork-ubuntu-22-04`.
- Confirmed from local binary inspection:
  `stork-ubuntu-20-04` references `libssl.so.1.1` and `libcrypto.so.1.1`
  while `stork-ubuntu-22-04` references `libssl.so.3` and `libcrypto.so.3`.
- Confirmed from Node 22 docs and local runtime checks:
  Node 22 exposes a global `navigator`, so `typeof navigator !== 'undefined'`
  is no longer a safe browser-only check.
- Confirmed locally on 2026-03-15:
  `CI=1 mise exec node@22 -- pnpm run netlify-build` succeeds after switching
  the Stork target and fixing runtime detection.

## What Works

- Use Stork's `stork-ubuntu-22-04` binary on Linux/Netlify.
- Use `stork-macos-13-arm` on Apple Silicon Macs.
- Detect browser context with `window` and `document`, not `navigator`.
- Keep the fix in `doesitarm`; `../doesitarm-functions/` is an external API
  dependency referenced via `VFUNCTIONS_URL` and `PUBLIC_API_DOMAIN`, not part
  of the failing Netlify build path.

## What To Avoid

- Do not keep using `stork-ubuntu-20-04` on Noble/Ubuntu 24.
- Do not use the `stork-amazon-linux` artifact as a Netlify fallback; its
  binary references `libssl.so.10`, which is also not a fit for Ubuntu 24.
- Do not use `navigator` as the only browser-runtime signal in Node 22+ code.

## Recommendation

Keep the Stork fix minimal and repo-local:

1. Detect the Stork binary target from `process.platform` and `process.arch`.
2. Use `stork-ubuntu-22-04` for Linux builds.
3. Use `stork-macos-13-arm` for Apple Silicon.
4. Add tests for runtime detection and Stork target selection.
5. Leave `../doesitarm-functions/` unchanged unless its own deployment starts
   failing independently.

## Source Links

- Stork latest release metadata:
  https://api.github.com/repos/jameslittle230/stork/releases/latest
- Stork install docs:
  https://stork-search.net/docs/install
- Stork CI/Netlify guide:
  https://stork-search.net/docs/stork-and-netlify
- Node 22 globals docs:
  https://nodejs.org/dist/latest-v22.x/docs/api/globals.html

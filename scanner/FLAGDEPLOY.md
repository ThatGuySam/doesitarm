# Scanner v3 feature flag

November 25, 2026. The patch is in [results/flagdeploy.patch](results/flagdeploy.patch) and the source is in the detached `~/Code/doesitarm-v3flag` worktree at `ed7b9528a0e2010513c83f5c3ebad746edc9a67d`.

## Live routing

| Host or service | Active Worker | Active version |
| --- | --- | --- |
| `doesitarm.com/*` and the `cf.doesitarm.com` custom domain | `doesitarm-cf-preview` | `924fb944-9f3e-422e-bda5-81beed1afc76` |
| Scanner backend | `doesitarm-scanner-preview` | `691542a0-4fb9-4124-9211-e39780e59a47` |
| New isolated lane | `doesitarm-v3-lane` | `e6bb14e3-5ba5-42f5-8a69-d6f9bf0fbf2f` |

Cloudflare's live route and custom domain APIs confirm the frontend mapping. Commit `1597575` added the apex route. Both live hosts returned 200 and `Cache-Control: s-maxage=1, stale-while-revalidate` for the scanner page. The existing cf host added `X-Robots-Tag: noindex, nofollow`.

Wrangler attached the preview custom domain at 22:05 UTC and deployed the verified revision at 22:10 UTC. The route and custom-domain tables still assign both existing frontend hosts to `doesitarm-cf-preview`. [Open scanner v3 on the isolated lane](https://v3.doesitarm.com/apple-silicon-app-test/?v=3).

## Version selection

- The Cloudflare Worker entrypoint selects `?v=3` on the existing scanner path, before handing other requests to Astro. It uses `SCANNER_V3` to serve the scanner UI and call its existing API. The UI runs as the top-level page with its own compact Does It ARM navigation, so local pickers and drops run in the first-party document. Shell-relative JavaScript, CSS, Wasm, and recorded data are served below `/apple-silicon-app-test/`. The API remains same-origin at `/api/scan`.
- The service binding reuses the deployed scanner. It preserves the public request host, fetch metadata, and Cloudflare client address while removing cookies and authorization on the forwarded request. The scanner service continues enforcing public HTTPS destinations, 12 scans per minute, and a 5-second CPU limit. Its rate bucket is shared with requests to that service at the same location and client key. The binding follows the backend’s active deployment.
- The frontend disables automatic invocation logs and tracing because the scan query can contain signed download URLs. The backend’s settings report no configured observability. [Cloudflare invocation logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#invocation-logs).
- No flag returns the existing Astro page and keeps its cache policy. The older `?version=2` path still works. Explicit `?v=1` renders the legacy scanner and adds the dismissible reverse switch. The switch and its two asset tags are the only intentional HTML additions for explicit `?v=1`. Nothing is stored to remember a dismissal.
- Both explicit variants are `no-store` and `noindex`. V3 HTML also uses `no-transform` so the edge preserves the scanner body and its strict CSP. The isolated lane also uses a separate static asset copy with crawler blocking headers and `robots.txt`. The OAuth session could read the Workers route table, but the zone Cache Rules endpoint returned 403 (code 10000), so cache policy is verified from live HTTP behavior. [Cloudflare response body inspection](https://developers.cloudflare.com/rules/configuration-rules/response-body-inspection/).
- A same-origin static copy would still need a proxy for URL scans and an asset sync for every scanner release. The binding keeps shell, browser Wasm, and API together on the scanner Worker. A frame adds another browsing context and its picker constraints. [Astro custom Worker entrypoint](https://v6.docs.astro.build/en/guides/integrations-guide/cloudflare/#changed-custom-entrypoint-api), [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).

## Verification

| Check | Result |
| --- | --- |
| No-flag HTML | Live lane HTML matched the unmodified build after normalizing the newsletter form's per-render UUID and its dependent Astro island ID. Alternating no-flag, v3, v1, then no-flag requests returned the expected pages. |
| Explicit v1 HTML | Matched the no-flag body after the same normalization and removal of the version notice and its two asset tags. |
| Version switches | Chromium clicked both links on desktop and tapped v1’s switch on a 390 px mobile viewport. Dismissal hid the notice and focused the scanner heading. |
| Wasm | `application/wasm` with both gzip and Brotli. Both decoded bodies matched the scanner build hash `e4c304d8e3fb9cf2cdbb664583d250398d2667d0f9cc515a5cbbe879e6ae5df8` from source `bb62a7cb1a4a490c9228e82f111b6aa4d32a2e3c`. |
| Local scan | Chromium opened the file picker and scanned `fat.macho`, reporting verified x86_64 and arm64e. |
| Public DMG | Chromium rescanned Little Snitch through the lane’s same-origin API. It returned HTTP 200, verified arm64 and x86_64, and read 1,537,681 source bytes. The browser run reported zero console or page errors. |
| Destination and origin checks | Loopback and untrusted cross-site requests returned 403 with zero bytes read. A malformed budget still returned 400. The site forwards the backend’s denied-address JSON with 403. |
| Rate limit | The backend binding is configured for 12 per 60 seconds. In the MCI location, 16 bounded requests returned 200 and request 17 returned 429 with `Retry-After: 60`. Cloudflare applies the threshold approximately as counters synchronize. [Cloudflare rate-limit accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#accuracy). |
| Crawler controls | The lane has `X-Robots-Tag: noindex, nofollow`. Its `/robots.txt` returns `Disallow: /`. |
| Existing tests | Cloudflare builds passed before and after. 79 Vitest tests passed both times, with 3 existing todos. The requested Playwright file passed both uploads before against local workerd and after against the deployed lane. The scanner's 36 Node tests passed. |

The normalized no-flag HTML SHA-256 is `65b13dacf9fe4be16e0be1b359ef83abc570cc4755ab2db90bed5eefec235784`. The machine cached a pre-deploy negative DNS answer. Both Cloudflare and Google public DNS returned the new address, which the headless probes used with the real hostname and TLS.

## Before production promotion

Sam needs to approve production deployment and the Access plan with the lead. The Cloudflare Access gate is **pending on the endpoint**. The current Wrangler OAuth session has no Access scope. The lead will tell Sam. A hostname-based policy for the lane does not by itself gate the same-origin production endpoint.

After approval, build the reviewed patch with the workflow's public environment from `.github/workflows/deploy-cloudflare-frontend.yml`. Use the repository-pinned Wrangler for the Astro-generated config. The following commands target production and were not run.

```sh
cd "$HOME/Code/doesitarm-v3flag"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
set -e
while IFS= read -r setting; do
    export "$setting"
done < <(awk '
    /^env:$/ { capture = 1; next }
    /^jobs:$/ { capture = 0 }
    capture && /^  [A-Z_]+: / { sub(/^  /, ""); sub(/: /, "="); print }
' .github/workflows/deploy-cloudflare-frontend.yml)
CI=1 npx --yes --package pnpm@10.12.1 --call '
    pnpm cloudflare-build &&
    pnpm exec wrangler deploy --config dist/server/wrangler.json --message "Scanner v3 feature flag"
'
```

Confirm the planned deployment shows `doesitarm-cf-preview` and `SCANNER_V3 → doesitarm-scanner-preview`. Capture the active production version immediately before promotion for rollback. Have the reviewed patch land on master with human approval so the next scheduled deploy uses the same code. The previous version listed above is a snapshot, so use the version recorded immediately before promotion for `pnpm exec wrangler rollback VERSION_ID --config dist/server/wrangler.json`.

The uncommitted worktree edits and the patch match. No site commit, branch, or push was made.

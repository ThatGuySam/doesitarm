# Original Prompt

> Okay, I've got, we do have environment variables locally, and we may have the same ones on Netlify. Let's go ahead and Build a plan to set up this dual deploy to Cloudflare to use the local environment variables and see how that works. Cloudflare, the desertarm.com is on Cloudflare, so we can just set up the subdomain and it should work.

# Goal

Set up a reversible dual-deploy path where the same repo and same commit can be deployed to both Netlify and Cloudflare, with Netlify remaining primary during the migration and Cloudflare serving a shadow subdomain for parity testing, environment validation, and incremental runtime cleanup.

# Non-Goals

- Cut production traffic over to Cloudflare in the first pass.
- Migrate all site data dependencies to D1 as part of the initial dual-deploy spike.
- Remove Netlify-specific build and deploy paths before Cloudflare parity exists.
- Introduce a separate runtime or package-manager change just because the deployment target changes.

# Repo Findings

- The app currently uses the Netlify adapter in `astro.config.mjs` via `@astrojs/netlify`.
- Astro only uses one adapter per build, so dual deploy will require two build configurations rather than one config that targets both platforms simultaneously.
- Astro CLI supports `--config`, which makes a dual-build setup practical without splitting the repo immediately.
- Current environment keys present in local `.env` are:
- `ALL_UPDATE_SUBSCRIBE`
- `BUILD_ID`
- `COMMITS_SOURCE`
- `GAMES_SOURCE`
- `GOOGLE_API_KEY`
- `HOMEBREW_SOURCE`
- `PUBLIC_API_DOMAIN`
- `PUBLIC_URL`
- `SCANS_SOURCE`
- `TEST_RESULT_STORE`
- `URL`
- `VFUNCTIONS_URL`
- `VIDEO_SOURCE`
- The current frontend/build path is still Netlify-shaped:
- `astro.config.mjs` uses `@astrojs/netlify`
- `netlify.toml` defines redirects and build behavior
- `helpers/astro/request.js` calls `helpers/config-node.js`, which reads `netlify.toml` from disk at runtime
- `package.json` scripts are still centered on `netlify-build`
- Existing workflows are split across deploy hooks for functions/frontend and a separate Cloudflare worker deploy lane.
- There is already a Cloudflare zone for `doesitarm.com`, so attaching a Worker or custom domain to a subdomain should be straightforward once the Worker build exists.

# External Research

- Astro’s deployment model is adapter-based. Official docs indicate one adapter per build, and the CLI supports `--config <path>`, which is the cleanest way to run a Netlify build and a Cloudflare build from the same repo.
- Cloudflare recommends `wrangler.jsonc` for new projects and supports named environments under `env.<name>`.
- Cloudflare local development can load secrets from either `.dev.vars` or `.env`, but Cloudflare explicitly says to choose one or the other rather than relying on both at once.
- Cloudflare supports environment-specific `.env.<environment-name>` files and merges `.env` files by precedence during local development.
- Cloudflare Workers can be attached to a subdomain either by a route or by `custom_domain`, and custom domains are the preferred fit when the Worker is the origin for that subdomain.
- Astro’s Cloudflare adapter exposes Cloudflare environment variables and bindings through the Worker runtime, and current docs also support importing environment bindings from `cloudflare:workers`.

# Recommendation

- Use a dual-build, dual-deploy model from the same commit:
- Netlify remains the primary production deploy target.
- Cloudflare gets a shadow deploy on a subdomain such as `cf-preview.doesitarm.com` or `edge-preview.doesitarm.com`.
- Create a dedicated Cloudflare Astro config rather than trying to make one config branch internally on host.
- Reuse the existing local root `.env` for the first local Cloudflare spike only if there is no `.dev.vars` in play, because Cloudflare supports `.env`-based local loading.
- Treat that reuse as transitional. The durable state should be:
- `.env.example` for committed placeholders
- `.env` or `.env.local` for current app-local development
- Cloudflare-specific `.env.cloudflare`, `.env.staging`, or `.dev.vars` strategy chosen explicitly
- Wrangler-managed secrets for deployed Cloudflare environments
- Keep the first Cloudflare deployment reading the same external sources that Netlify uses today. Do not bundle D1 into the first shadow deploy unless it is required for the Cloudflare app to boot.

# Rollout Plan

1. Define the dual-deploy shape and naming.
- Pick the shadow subdomain and document its purpose.
- Decide whether Cloudflare shadow traffic uses a route or `custom_domain`.
- Decide the first dual-deploy branch policy:
- deploy both on `master`
- or deploy Cloudflare only on a dedicated branch/tag until parity work stabilizes
- Define success criteria for “Cloudflare shadow is viable” before any production cutover discussion.

2. Split Astro configuration into host-specific build targets.
- Keep the existing Netlify config as the current baseline.
- Add a Cloudflare-specific Astro config file that swaps `@astrojs/netlify` for `@astrojs/cloudflare`.
- Add build scripts that make the host target explicit, for example:
- `build:netlify`
- `build:cloudflare`
- `preview:cloudflare`
- Keep shared Vite/integration logic in shared modules so the configs differ only where platform behavior truly differs.

3. Define the environment-variable contract for the Cloudflare shadow.
- Inventory each current env key by purpose:
- public site URL values
- external data-source URLs
- tokens/secrets
- build-only values
- runtime values
- Decide which values will live in Wrangler `vars` versus Wrangler secrets.
- For the first local spike, allow Wrangler to load from the existing root `.env` if the config stays at the repo root and there is no `.dev.vars`.
- After the spike, decide and document the long-term local convention:
- continue using `.env` for shared local values
- or move Cloudflare-specific sensitive values to `.dev.vars`
- Add a checked-in env template artifact so Cloudflare setup is reproducible without copying the real `.env`.
- Ensure no secret-bearing values are printed by CI or committed into Wrangler config.

4. Make the runtime path adapter-neutral enough for shadow deploy.
- Remove runtime dependency on `netlify.toml` from the request path.
- Extract redirects into a platform-neutral source of truth that both Netlify and Cloudflare can consume.
- Audit any assumptions that rely on Netlify SSR behavior, filesystem layout, or deploy-hook conventions.
- Confirm whether `helpers/url.js` and public runtime config are still correct under the Cloudflare adapter.

5. Add a local Cloudflare development lane.
- Add Wrangler config and local run instructions.
- Add a local dev command that exercises the Cloudflare target with the current env contract.
- Verify that the app boots locally on the Cloudflare target using local env values without editing secrets into source control.
- Add binding/type generation if the Cloudflare adapter path needs `wrangler types`.

6. Add CI dual deploy without cutting over traffic.
- Keep existing Netlify deploy flow intact.
- Add a Cloudflare build-and-deploy workflow from the same commit SHA.
- Deploy the Cloudflare build to the shadow subdomain.
- Keep the Cloudflare workflow isolated from public PR execution until secrets and permissions are hardened.
- Make the deploy output report the Netlify URL, Cloudflare shadow URL, commit SHA, and environment used.

7. Add parity checks for the shadow environment.
- Run smoke checks against both Netlify and Cloudflare deployments.
- Verify:
- homepage
- one dynamic app page
- one formula page
- app-test page
- redirects
- static search assets
- Compare response behavior, major console/runtime errors, and critical page content between the two hosts.
- Log differences in a durable artifact so the cleanup work is visible before cutover.

8. Decide the cutover gate.
- Define the minimum parity bar:
- stable deploys
- no runtime-only Cloudflare failures
- environment values mapped cleanly
- redirects equivalent
- key pages verified
- Only after that, decide whether to:
- switch DNS/subdomain roles
- proxy production traffic through Cloudflare
- or continue Netlify as origin while more data-layer migration work lands

# Validation Gates

- Local Cloudflare target boots successfully with local env values and no committed secrets.
- Both host-specific Astro builds complete from the same commit.
- Cloudflare shadow subdomain serves the app over the Cloudflare zone.
- Redirect behavior is equivalent on a representative sample of known redirects.
- Core routes render on both hosts:
- `/`
- one `/app/...`
- one `/formula/...`
- `/apple-silicon-app-test/`
- CI output for Cloudflare deploy contains no secret material.
- Netlify remains healthy throughout the shadow rollout.

# Deliverables

- A focused dual-deploy plan in `docs/plans/cloudflare-dual-deploy-shadow.md`
- A target naming decision for the shadow subdomain
- Host-specific Astro build configs and scripts plan
- An explicit Cloudflare env/secrets mapping plan based on current local keys
- A runtime-neutralization checklist for Netlify-specific request/config logic
- A parity verification checklist for Netlify vs Cloudflare

# Risks And Open Questions

- The current runtime read of `netlify.toml` is the biggest likely blocker for “works the same on both hosts.”
- Reusing the current root `.env` for the first Cloudflare spike is practical, but it may blur long-term ownership unless a dedicated Cloudflare local env convention is chosen quickly.
- Some current env keys may be build-time only or tied to Netlify/external APIs; they should not all be assumed to map 1:1 to Cloudflare runtime secrets.
- If the Cloudflare shadow deploy uses the same backend sources as Netlify, host parity is easier but data-layer migration remains deferred.
- If the Cloudflare deploy is allowed to drift from the Netlify build graph, the comparison loses value.
- The existing Cloudflare worker workflow currently prints secret-derived files to logs; this must be treated as a blocker to any secret-bearing Cloudflare app deploy workflow.

# Sources

- `astro.config.mjs`
- `package.json`
- `.github/workflows/deploy-cloudflare-workers.yml`
- `.github/workflows/deploy-frontend.yaml`
- `.github/workflows/deploy-functions.yaml`
- `netlify.toml`
- `helpers/astro/request.js`
- `helpers/config-node.js`
- Cloudflare Wrangler configuration docs:
  https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare environments docs:
  https://developers.cloudflare.com/workers/wrangler/environments/
- Cloudflare local environment variables docs:
  https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare custom domains docs:
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains
- Astro CLI docs:
  https://docs.astro.build/en/reference/cli-reference/
- Astro Cloudflare adapter docs:
  https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Astro Netlify adapter docs:
  https://docs.astro.build/en/guides/integrations-guide/netlify/

# Public Repo Security And Monorepo Patterns For doesitarm

Tease: The safest version of this plan keeps `doesitarm` public, but treats credentials, imports, downloaded app artifacts, and privileged automation as private operational surfaces.

Lede: For `doesitarm` on 2026-04-04, the best-fit pattern is a Kriasoft-style public monorepo with clear `apps/`, `packages/`, `db/`, and `infra/` boundaries, plus hardened GitHub Actions, GitHub-hosted runners for public workflows, D1 local development via Wrangler, and private storage for secrets, backups, and quarantined artifacts.

Why it matters:
- The current repo is about to add higher-risk surfaces: D1, automated app discovery, archive downloading, scheduled jobs, and more Cloudflare automation.
- In a public repo, CI/CD mistakes matter as much as application code mistakes. Workflow files, tokens, logs, and runner choices become part of the threat model.
- The current repo already has one immediate security problem: a workflow prints secret-derived files to CI logs.

Go deeper:
- Keep the code public; keep secrets, raw data, and operational state private.
- Refactor toward a monorepo shape early so new ingestion, scanner, D1, and infra code do not spread across a flat root.
- Adopt OSS-friendly GitHub hardening: read-only default `GITHUB_TOKEN`, pinned actions, CODEOWNERS on workflow/infra/db paths, secret scanning, private vulnerability reporting, and no self-hosted runners for public PRs.

Date: 2026-04-04

## Scope

Research security considerations and common open-source repository patterns for a
setup like `doesitarm`:

- public GitHub repository
- Cloudflare Workers and D1
- scheduled automation
- automated downloading and scanning of third-party app archives
- prospective monorepo refactor in the style of
  `kriasoft/react-starter-kit`

This memo is intended to drive updates to
[app-discovery-d1-automation.md](/Users/athena/Code/doesitarm/docs/plans/app-discovery-d1-automation.md).

## Short Answer

Do not move the whole repo private.

Instead:

1. Keep the application and infrastructure code public.
2. Move secrets, imported raw data, D1 operational state, downloaded artifacts,
   quarantined samples, and any sensitive fixtures to private systems.
3. Refactor into a monorepo early, using a Kriasoft-style structure adapted to
   this repo's existing pnpm/Netlify/Astro/Workers setup.
4. Harden GitHub Actions before expanding automation.

Best-fit recommendation:

- Public monorepo with `apps/`, `packages/`, `db/`, `infra/`, `scripts/`,
  and `docs/`
- GitHub-hosted runners for public workflows
- GitHub environment secrets with required reviewers for production deploys
- Cloudflare D1 local development and tests via Wrangler `--local`,
  `preview_database_id`, and test harnesses like `unstable_dev()`/Miniflare
- Private object storage or equivalent for raw app archives, import dumps,
  and quarantine material

Inference:
This is the right fit because the repo is open source and community-facing, but
the risky parts are operational, not architectural. Public code is compatible
with good security here; public credentials and public operational data are not.

## What The Repo Already Knows

- The repo is currently flat-rooted, not organized as a workspace monorepo.
- There is no checked-in D1 configuration or local D1 bootstrap yet.
- There is Cloudflare deployment automation in
  [deploy-cloudflare-workers.yml](/Users/athena/Code/doesitarm/.github/workflows/deploy-cloudflare-workers.yml).
- That workflow currently decodes secret-backed `.env` / `wrangler.toml` files
  and prints them with `cat`, which is a real security issue in CI logs.
- The site build still depends on remote/env-backed feeds such as
  `SCANS_SOURCE`, `COMMITS_SOURCE`, `HOMEBREW_SOURCE`, `GAMES_SOURCE`, and
  `VFUNCTIONS_URL`.
- The scanner and planned discovery pipeline will process untrusted third-party
  files, including archive formats like ZIP, DMG, and PKG.
- `.env` is ignored at the root, and per-worker `wrangler.toml` files are
  already ignored in worker subdirectories.

## What The Evidence Says

### 1. Public repos can stay public if the operational boundary is private

GitHub's own docs assume public repositories will use:

- repository or environment secrets
- restricted organization secret access
- private vulnerability reporting
- automatic secret scanning on public repos

That is strong evidence that the normal pattern is not "make the repo private";
it is "keep sensitive operational material out of the repo and out of logs."

### 2. Default GitHub Actions posture should be least privilege

GitHub recommends:

- minimum required `GITHUB_TOKEN` permissions
- default repository token permission set to read-only
- escalating permissions only per job
- using a GitHub App token if a job needs more than `GITHUB_TOKEN` can provide

This matches what open-source repos increasingly do for deploy, release, and
cross-repo automation.

### 3. Secrets are still easy to leak through logs and workflow behavior

GitHub's secure-use docs explicitly warn that:

- redaction is not guaranteed for transformed values
- structured blobs like JSON/YAML are poor secret formats
- non-secret values should be masked explicitly with `::add-mask::`
- exposed secrets in logs should trigger deletion/rotation

For `doesitarm`, this directly applies to the current workflow that prints
secret-derived config files into CI output.

### 4. Public repos should avoid self-hosted runners for untrusted PRs

GitHub explicitly recommends self-hosted runners only with private
repositories, because forks of public repositories can run dangerous code on
them through pull requests.

For this repo, that means:

- do not put public PR workflows on a local machine or other long-lived
  self-hosted runner
- do not run untrusted archive-processing jobs on a self-hosted runner that
  also holds production credentials

### 5. `pull_request_target` remains a common footgun

GitHub Security Lab's `Preventing pwn requests` guidance is still the clearest
implementation reference:

- `pull_request_target` plus checking out/building PR code is dangerous
- untrusted PR code should run in an unprivileged `pull_request` workflow
- privileged follow-up actions should happen through `workflow_run` with
  carefully handled artifacts

HN discussion around real workflow exploits reinforces the same point: the
problem is not theoretical.

### 6. Common OSS hardening patterns for GitHub workflows are now well-defined

GitHub secure-use guidance and OpenSSF best-practice guidance converge on:

- pin actions to full commit SHAs
- restrict allowed actions where possible
- guard `.github/workflows/` with `CODEOWNERS`
- keep default branch protected
- require reviews and passing checks
- use code scanning / dependency review / secret scanning / Dependabot
- use private vulnerability reporting for public repos

These are standard public-repo practices, not enterprise-only overkill.

### 7. Cloudflare D1 already supports local-first development and tests

Cloudflare's D1 docs explicitly support:

- `wrangler dev` local mode
- `preview_database_id`
- `wrangler d1 migrations apply --local`
- test setups using Miniflare and `unstable_dev()`

That means D1 does not require a private repo or remote-only workflow. It fits
the "run locally on this machine, then automate" plan well.

### 8. Cloudflare Workflows and observability make Cloudflare a credible later home for ingestion

Cloudflare Workflows now position themselves as durable multi-step execution
with retries, persisted state, and debugging. Workers Logs and Traces provide
native observability. That is enough evidence to treat Cloudflare as a viable
later landing zone for scheduled ingestion and scan orchestration.

Inference:
GitHub Actions is still the easier first scheduler because it is already in the
repo, but Cloudflare Workflows has matured enough to stay in the plan as a
serious later option.

### 9. Kriasoft's monorepo shape is a good architectural fit, but not every exact convention should be copied blindly

`kriasoft/react-starter-kit` is a public monorepo with:

- `apps/`
- `packages/`
- `db/`
- `docs/`
- `infra/`
- `scripts/`

It also documents a public template env pattern where committed `.env`
contains placeholders/defaults and `.env.local` contains real credentials.

That shape is a strong fit for `doesitarm`, but I would adapt the env pattern
slightly for safety and clarity:

- keep a committed public template file such as `.env.example`
- keep real credentials in `.env.local`, `.dev.vars`, GitHub environment
  secrets, and Cloudflare secrets

Inference:
Kriasoft's folder layout is the part worth copying directly. The exact env-file
naming should follow the least-confusing safe convention for this repo.

## Common Open-Source Patterns That Fit doesitarm

### Public code, private state

Keep public:

- app code
- scanner code
- D1 schema and migrations
- workflow definitions
- docs and plans

Keep private:

- deploy credentials and tokens
- raw Google Sheets exports or database backups
- downloaded app archives
- quarantine samples
- private test fixtures that would create redistribution or abuse risk
- operational dashboards and alert destinations

### Workspace monorepo with clear trust boundaries

Best-fit structure for `doesitarm`:

- `apps/web/` — Astro site and app-test UI
- `apps/default-worker/` — current `doesitarm-default`
- `apps/analytics-worker/` — current `workers/analytics`
- `apps/ingest/` or `apps/discovery/` — CLI/admin surface for discovery jobs
- `packages/scanner-core/` — shared scan engine and file-format logic
- `packages/source-runners/` — Homebrew/GitHub/download-page source runners
- `packages/data-model/` — shared D1 schema types, DTOs, validation
- `packages/site-build/` — list/build/export helpers
- `db/` — D1 migrations, seeds, import scripts, local test DB helpers
- `infra/` — Wrangler config, deploy config, policy docs
- `scripts/` — repo automation
- `docs/` — plans, research, operational docs

### Repo template files, not repo secrets

Common OSS pattern:

- commit `.env.example` or placeholder-only `.env`
- ignore `.env.local`, `.dev.vars`, and `.wrangler/`
- keep Cloudflare secrets in Workers secrets / GitHub environment secrets

### Hardened GitHub Actions for public forks

Common OSS pattern:

- default `permissions: { contents: read }`
- explicit per-job escalation only
- require approval for fork PR workflows where appropriate
- no self-hosted runners for public PRs
- no `pull_request_target` workflows that checkout/build PR code

### Supply-chain hygiene for workflows

Common OSS pattern:

- pin actions to full SHAs
- restrict allowed actions
- Dependabot for action updates
- CodeQL / code scanning for workflow vulnerabilities
- OpenSSF Scorecards for ongoing hygiene checks

### Disclosure and scanning defaults

Common OSS pattern:

- enable private vulnerability reporting
- enable secret scanning and push protection
- keep a `SECURITY.md` policy

## What Works

- Keeping the repo public while moving secrets and sensitive data out of git
- Refactoring to a monorepo before adding more D1/discovery complexity
- Treating workflow files, `infra/`, and `db/` as protected surfaces with
  `CODEOWNERS`
- Using GitHub-hosted runners for public CI and scheduled jobs
- Using environment-specific secrets with required reviewers for production
  deployment jobs
- Using D1 local mode and local migrations as part of normal development
- Using Cloudflare Logs/Traces or equivalent observability for scheduled jobs
- Storing raw archives and quarantine material in private object storage rather
  than in the repo

## What To Avoid

- Do not move the whole repo private as a substitute for secrets hygiene
- Do not keep the current workflow behavior that prints secret-derived files to
  CI logs
- Do not use self-hosted runners for public PR workflows
- Do not run archive downloads/extraction in privileged workflows that also have
  deploy credentials
- Do not combine `pull_request_target` with explicit PR checkout/build steps
- Do not keep adding discovery/D1/worker code into the current flat root
- Do not commit raw import dumps, app archives, or structured secret blobs

## Recommendation

For `doesitarm`, the strongest next-step package is:

1. Refactor toward a Kriasoft-style monorepo shape adapted to pnpm.
2. Add a security-hardening stage before expanding automation.
3. Keep the repo public.
4. Keep secrets, raw operational data, and archive/quarantine material private.
5. Start scheduled discovery on GitHub-hosted runners with hardened workflows.
6. Keep Cloudflare Workflows as a second-phase target for durable ingestion.

Immediate high-priority actions to capture in the plan:

1. Remove secret printing from
   [deploy-cloudflare-workers.yml](/Users/athena/Code/doesitarm/.github/workflows/deploy-cloudflare-workers.yml)
   and rotate affected secrets.
2. Add repo policy and tooling for:
   - read-only default `GITHUB_TOKEN`
   - pinned actions
   - `CODEOWNERS` for `.github/workflows/`, `infra/`, and `db/`
   - secret scanning / push protection
   - private vulnerability reporting
3. Add ignored local-secret files for the new D1/Workers workflow:
   - `.env.local`
   - `.dev.vars`
   - `.wrangler/`
4. Keep public PR CI on GitHub-hosted runners only.
5. Store raw archives/import snapshots outside the repo.

## Missing Information

- Whether the future ingestion runtime is expected to stay GitHub-first or
  eventually move fully to Cloudflare Workers/Workflows.
- Whether there are legal or vendor-policy constraints around storing downloaded
  app archives long term.
- Whether the monorepo refactor should keep Netlify as-is or consolidate more
  runtime surfaces onto Cloudflare.

## Source Links

- GitHub Docs, `GITHUB_TOKEN` least-privilege and GitHub App escalation:
  https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
- GitHub Docs, secrets in Actions, fork-secret behavior, environment reviewers,
  OIDC, and masking:
  https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- GitHub Docs, secure use reference, pinning actions, CODEOWNERS, code scanning,
  Dependabot, and Scorecards:
  https://docs.github.com/en/actions/reference/security/secure-use
- GitHub Docs, self-hosted runner warning for public repositories:
  https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
- GitHub Docs, limiting self-hosted runners in organizations:
  https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization
- GitHub Docs, approval requirements for fork PR workflows:
  https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/approving-workflow-runs-from-public-forks
- GitHub Docs, repository Actions settings and fork workflow controls:
  https://docs.github.com/github/administering-a-repository/managing-repository-settings/disabling-or-limiting-github-actions-for-a-repository
- GitHub Docs, secret scanning for public repositories:
  https://docs.github.com/github/administering-a-repository/about-token-scanning
- GitHub Docs, enabling secret scanning / push protection:
  https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enabling-secret-scanning-for-your-repository
- GitHub Docs, enabling push protection:
  https://docs.github.com/en/code-security/secret-scanning/enabling-secret-scanning-features/enabling-push-protection-for-your-repository
- GitHub Docs, private vulnerability reporting:
  https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository
- GitHub Security Lab, `pull_request_target` / `workflow_run` guidance:
  https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- OpenSSF GitHub configuration best practices:
  https://best.openssf.org/SCM-BestPractices/github/
- Kriasoft React Starter Kit:
  https://github.com/kriasoft/react-starter-kit
- Cloudflare D1 local development:
  https://developers.cloudflare.com/d1/best-practices/local-development/
- Cloudflare Workers observability:
  https://developers.cloudflare.com/workers/observability/
- Cloudflare Workers logs:
  https://developers.cloudflare.com/workers/observability/logs/
- Cloudflare Workers traces:
  https://developers.cloudflare.com/workers/observability/traces/
- Cloudflare Workflows overview:
  https://developers.cloudflare.com/workflows/

## Source Quality Notes

- Highest-confidence sources in this memo are GitHub Docs, GitHub Security Lab,
  OpenSSF, Cloudflare Docs, and the Kriasoft repository itself.
- HN/Lobsters did not surface a materially better competing pattern in this
  pass; the most useful HN signal reinforced GitHub Security Lab's warning on
  `pull_request_target`.
- The recommendation to keep the repo public but move operational data private
  is a synthesis from official guidance plus this repo's current shape and risk
  surface.

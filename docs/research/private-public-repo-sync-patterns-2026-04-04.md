# Private/Public Repo Sync Patterns For doesitarm

Tease: Git can push to a second remote, but it does not natively maintain a safe long-lived branch that "merges everything except `docs/`."

Lede: For `doesitarm` on 2026-04-04, the best-fit pattern is a second repo/remote plus an automated one-way export from `origin/master` that rewrites out `docs/` and force-pushes the result.

Why it matters:
- `docs/` is already present on `origin/master`, so excluding it from a future mirror does not make it private retroactively.
- `docs/` does not appear to participate in the app build, which makes export-time exclusion low-risk.
- Cross-repo automation on GitHub needs separate auth; the default workflow token is not enough for another private repo.

Go deeper:
- Simple one-way sync: fresh clone -> `git filter-repo --path docs/ --invert-paths` -> force-push to a second remote.
- Faster repeated projection: evaluate `splitsh-lite` if export speed or repeatability becomes important.
- Advanced bidirectional filtered views: `josh` is the serious option, but it is heavier than this repo likely needs.

Date: 2026-04-04

## Scope

Research whether `doesitarm` should support a `private-main`-style branch or
remote that automatically tracks the public default branch while excluding
paths such as `docs/`, and identify better patterns if they exist.

## Short Answer

Yes, you can push to a different remote from the public repo.

No, the durable pattern is not a long-lived `private-main` merge branch that
keeps deleting `docs/` after every merge. Git branches and merges are full-tree
operations, and sparse checkout does not change that.

For this repo, the cleanest pattern is:

1. Keep `origin/master` as the source branch.
2. Add a second remote or second repository for the private target.
3. Run a one-way export job on each push to `master`.
4. In that job, create a sanitized tree/history with `docs/` removed.
5. Force-push the sanitized result to the private remote branch.

If the real requirement is that future docs stay private, the better topology
is the reverse: keep the canonical repo private and generate the public export.

Inference:
That last recommendation is based on the current repo state: `docs/` is already
committed on `origin/master`, so a private mirror without `docs/` only changes
future distribution, not past public exposure.

## What The Repo Already Knows

- The default remote today is only `origin`, pointed at the public GitHub repo.
- The default tracked branch is `origin/master`, not `main`.
- There is no checked-in `.github/` workflow that already handles cross-repo
  sync.
- `docs/` currently contains repo-local planning and research material:
  [docs/app-flow.md](/Users/athena/Code/doesitarm/docs/app-flow.md),
  [docs/plans/app-test-typescript-refactor.md](/Users/athena/Code/doesitarm/docs/plans/app-test-typescript-refactor.md),
  and dated research memos under
  [docs/research](/Users/athena/Code/doesitarm/docs/research).
- `docs/` is already present in `origin/master` history as of 2026-04-04.
- The build surface in
  [package.json](/Users/athena/Code/doesitarm/package.json)
  does not appear to depend on `docs/`.

## What The Evidence Says

- Different remote from the public repo:
  yes. Git supports separate remotes, and the `git remote` docs explicitly say
  that when fetch and push use different locations, you should use two separate
  remotes rather than pretending they are the same remote.
- Long-lived branch with path exclusions:
  not a native Git capability. Git merges operate on full trees, not
  "everything except these directories."
- Sparse checkout:
  not the answer here. The `git sparse-checkout` docs describe it as a working
  directory reduction feature, and they note that operations such as merge or
  rebase may still materialize paths outside the sparse specification.
- `git filter-repo`:
  good fit for one-way export. The Git project now recommends it instead of
  `filter-branch`, and its docs support `--invert-paths` for "keep everything
  except these paths" rewrites. That matches "mirror the repo except `docs/`."
- `splitsh-lite`:
  promising when you want repeatable projections into standalone repos and care
  about performance. Its README supports split prefixes that can include
  exclusions and uses a history cache, which is more appropriate than a manual
  merge branch when this becomes a repeated sync lane.
- `josh`:
  the advanced option. Its repo describes a proxy Git server that exposes
  filtered histories as standalone repos and synchronizes between original and
  filtered views. This is the closest thing to a "real" selective mirror
  system, but it adds operational weight.
- GitHub Actions auth:
  the default `github.token` is scoped to the current repository. If a workflow
  in the public repo needs to push to a different private repo, you need a PAT,
  deploy key, or GitHub App token instead.

## What Works

- A second remote or second repository for the private target.
- A one-way generated branch or repo, not a hand-maintained merge branch.
- Rebuilding the private export from `origin/master` every run.
- Treating the private mirror as generated output with force-pushes allowed.
- Keeping development on one source branch and one source-of-truth repo.

## What To Avoid

- Do not maintain `private-main` by repeatedly merging `master` and deleting
  `docs/`. That creates unnecessary churn and eventual conflict debt.
- Do not use sparse checkout as if it were a publishing filter.
- Do not make the generated private mirror a peer source of truth unless you
  also adopt a projection system designed for bidirectional sync.
- Do not rely on the default GitHub Actions token for pushes to another repo.
- Do not assume this setup hides `docs/` historically; those files are already
  in the public remote history.

## Best Patterns

## 1. Best Fit For This Repo: one-way export to a second remote

Use a second remote, for example `private`, pointing at a separate private
GitHub repository. On each push to `origin/master`, run an automation that:

1. checks out `master`
2. authenticates to the private repo with a PAT, deploy key, or GitHub App
3. creates a fresh export clone or export worktree
4. rewrites out `docs/` and any other excluded paths
5. force-pushes the sanitized result to the private repo branch

Why this is the best fit:

- it matches the repo's current single-source workflow
- it does not depend on path-aware merges that Git does not have
- it keeps excluded-path logic in one place
- it is easy to reason about and recover from

Tradeoffs:

- exported commit SHAs will differ from public `master`
- the private mirror should be treated as generated/read-only

## 2. Better If Repeated Projection Becomes Core: `splitsh-lite`

If you end up publishing multiple filtered mirrors or need fast repeated
updates, `splitsh-lite` is worth a spike. It is built for turning repository
views into standalone histories and caching the work.

Tradeoffs:

- more specialized operational knowledge
- less obvious to future maintainers than a simple export script

## 3. Better Only For Advanced Bidirectional Partial Views: `josh`

If the real requirement becomes "developers commit through filtered views and
changes synchronize both directions," `josh` is the pattern to study.

Tradeoffs:

- significant infrastructure/runtime overhead
- far more complexity than `doesitarm` appears to need today

## 4. Adjacent But Not The Same Problem: GitHub Private Mirrors

GitHub's `private-mirrors` app is relevant if the goal is to collaborate
privately around a public repository and upstream later. It is not the right
answer for "same repo minus `docs/`," but it is worth noting as a neighboring
pattern.

## Recommendation

For `doesitarm`, use a separate private repository plus a generated sync job.
Name the target branch after the actual default branch in this repo, for
example `private-master` or simply `master` on the private remote.

Do not implement this as a merge branch.

If the aim is just "same code, different remote, minus `docs/`," a generated
one-way mirror is the right level of machinery.

If the aim is "keep future internal docs private," move the source of truth to
a private repo and generate the public mirror from that private origin.

## Missing Information

- Whether the private target is intended to be read-only/generated or whether
  anyone will commit directly to it.
- Whether `docs/` is the only excluded path or just the first example.
- Whether the real goal is secrecy, deployment hygiene, or private-only
  collaboration before publishing.

## Source Links

- Git remote docs:
  https://git-scm.com/docs/git-remote
- Git sparse-checkout docs:
  https://git-scm.com/docs/git-sparse-checkout
- `git-filter-repo` repository:
  https://github.com/newren/git-filter-repo
- `git-filter-repo` manual:
  https://www.mankier.com/1/git-filter-repo
- `splitsh-lite` repository:
  https://github.com/splitsh/lite
- `josh` repository:
  https://github.com/josh-project/josh
- `actions/checkout` README:
  https://github.com/actions/checkout
- GitHub App auth in GitHub Actions:
  https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow
- GitHub deploy keys:
  https://docs.github.com/v3/guides/managing-deploy-keys
- GitHub Private Mirrors app:
  https://github.com/github-community-projects/private-mirrors
- Stack Overflow, partial sharing of Git repositories:
  https://stackoverflow.com/questions/278270/partial-sharing-of-git-repositories

## Source Quality Notes

- HN and Lobsters searches on 2026-04-04 did not surface a clearly better
  mainstream pattern than the Git/GitHub docs plus the specialized projection
  tools above.
- Primary docs and project READMEs were materially more useful than forum
  commentary for this question.

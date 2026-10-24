---
name: doesitarm-app-review
description: Review Does It ARM app-listing pull requests and app-request or compatibility-update issues. Use for evidence checks, listing corrections, and authorized merge and contributor follow-up work in ThatGuySam/doesitarm; excludes general code and infrastructure reviews.
---

# Does It ARM app review

Bring each requested contribution to an evidence-backed review decision or, when authorized, a verified published listing with contributor follow-up complete.

## Read the maintained sources

Paths below are relative to this skill directory. This skill belongs in the Does It ARM checkout; keep repo policy in the linked sources rather than copying it here.

- Read [AGENTS.md](../../../AGENTS.md) for branch policy and [docs/app-flow.md](../../../docs/app-flow.md) for review criteria, issue handling, and required contributor follow-up.
- For PRs, read the [app addition template](../../../.github/PULL_REQUEST_TEMPLATE/app_addition_template.md). For issues, read the matching [request](../../../.github/ISSUE_TEMPLATE/app-request-template.yml) or [update](../../../.github/ISSUE_TEMPLATE/app-update-template.yml) form.
- Inspect the relevant category and legend in [README.md](../../../README.md) for the current listing and status vocabulary. Search for existing listings and related issues or PRs before adding an app.
- When validating edits or investigating deployment, inspect [package.json](../../../package.json), the relevant [tests](../../../test), and current [workflows](../../../.github/workflows). Resolve public routes using [slug.js](../../../helpers/slug.js) and [app-derived.js](../../../helpers/app-derived.js), or the API endpoint, as directed by the app-flow guide.

## Carry out the request

For review-only requests, inspect and report without posting comments, editing listings, merging, or closing issues. For action requests, carry forward the session's authorization and complete the in-scope work; this skill itself grants no authority to mutate GitHub or send contributor messages.

Read the current issue or PR body, diff, comments, and checks. Recover the current listing, completed work, and closure instructions first. Apply the app-flow evidence record and review criteria to the exact product and version. Recheck the PR head before merging if it has changed since review.

For newest or most recent issues, query live GitHub issues in descending creation order. Include closed and unlabeled issues unless the user narrows the scope; report that scope. Do not substitute recent activity or a label-filtered queue for newest issues. Read comments and related PRs before recommending one next action per issue.

For authorized changes, make the smallest supported correction under the repo's branch policy, validate the affected listings, and follow the app-flow guide through publication and contributor replies. Check existing comments and linked issues when resuming so completed work is not repeated.

If evidence, deployment, or public verification remains blocked, finish independent authorized work and identify the exact blocker and next action. Do not turn a pending deployment into a completion claim or poll indefinitely. Arrange follow-up using available capabilities within the user's authorization; otherwise state what remains for the user.

## Report the result

Lead with the outcome. Use the app-flow dispositions and name the next action and any blocker. For multiple contributions, use a compact table linking each issue or PR with its disposition, evidence or correction, and next action. For completed work, include the commit or merge, validation performed, public listing links, and contributor follow-up status. Distinguish reviewed, merged, deployed, and verified live; distinguish a listing correction from resolution of a reported defect.

When changing this skill or its shared policy, exercise the [regression cases](evals/evals.json). These are decision examples, not current compatibility claims.

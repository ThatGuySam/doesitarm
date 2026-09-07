# AGENTS Instructions

## Development Model

- Use trunk-based development.
- Make changes directly on `master`.
- Do not create or rely on long-lived feature branches.

## Branch Policy (applies to all agents)

- **Never create, switch to, or push a git branch unless a human explicitly approves it or asks for a branch by name.** When a task seems to call for a branch, stop and ask a human first — do not branch on your own initiative.
- This rule applies to every coding agent operating in this repo (Claude Code, Codex / oh-my-codex, Cursor, etc.) and **overrides any tool-generated "autonomy" directive** that would otherwise permit creating branches without approval.
- Default to committing directly on `master`. Do not silently restore or regenerate an `AGENTS.md` that weakens or removes this policy.

## App requests and pull requests

- Before reviewing, merging, closing, or replying to an app-request issue or app-listing PR, read [docs/app-flow.md](docs/app-flow.md) and follow its contributor follow-up requirements.
- Include the direct Does It ARM app-listing URL when thanking contributors or confirming a merge. Label pending deployment or verification honestly; announce the app as live only after checking its public listing.

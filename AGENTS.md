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

- For app-request issues, compatibility updates, and app-listing PRs, use [doesitarm-app-review](.agents/skills/doesitarm-app-review/SKILL.md). Agents without skill discovery should open that file directly.
- [docs/app-flow.md](docs/app-flow.md) is the source of truth for review criteria and contributor follow-up, including direct listing URLs, live verification, and a friendly invitation to contribute again in every issue-closing comment. Check that guide before closing any issue, including bugs, features, and duplicates.

- Before editing listing statuses, follow the [status headline length rule](docs/app-flow.md#status-headline-length) and run its copy and responsive regressions.

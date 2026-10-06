# Use pstack in Claude Code

The project settings register Michael Denyer's
[pstack Claude port](https://github.com/michael-denyer/pstack-claude/tree/v0.9.74)
at tag `v0.9.74`, observed at commit
`552b1c85f990f1b0bb7d9806aa2e8461ce5438d0` on October 6, 2026.
Automatic marketplace updates are disabled so upgrades are deliberate.

## Install in a local session

1. Open this repository in Claude Code and accept its workspace trust prompt.
2. Run `/plugin install pstack@pstack-claude --scope project`.
3. Restart Claude Code and confirm that `/pstack:poteto-mode` is available.
4. Run `/pstack:setup-pstack` to select models and effort from the models your
   Claude session actually supports.

If the marketplace is missing, run
`/plugin marketplace add michael-denyer/pstack-claude#v0.9.74` before installation.

`CLAUDE.md` imports `AGENTS.md` and routes work through pstack. The repository's
direct-on-`master` policy and app review procedure remain authoritative.
This setup does not change global Claude configuration or select model overrides.
The installed plugin supplies its SessionStart hook; the existing global pstack
model sheet can turn that hook off.

[Claude's settings reference](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces)
documents marketplace registration and plugin enablement. Registration requires
workspace trust. Enabling an external plugin in project settings does not install
it for every user. Claude cloud sessions do not load these marketplace plugins;
this configuration targets local Claude Code.

## First trial on issue 261

The oldest open issue on October 6, 2026 was
[Synergy / Barrier, #261](https://github.com/ThatGuySam/doesitarm/issues/261),
created November 20, 2020. Its September 7, 2026 completion comment already links
the updated listings and leaves the issue open for maintainer review.

The trial used pstack's Investigation playbook and Codex tool mapping, together
with `doesitarm-app-review`. A separate read-only reviewer checked the evidence.
Claude Code was unavailable in the execution workspace, so this was a workflow
trial under Codex, not a Claude runtime or model-routing test.

| App | Live headline checked October 6, 2026 | Evidence and decision |
| --- | --- | --- |
| [Synergy](https://doesitarm.com/app/synergy) | Native Apple Silicon support | [Official macOS installer guidance](https://support.symless.com/hc/en-us/articles/33748566413585-Installing-Synergy-3-on-macOS) offers separate Apple Silicon and Intel installers. Keep the listing. |
| [Barrier KVM](https://doesitarm.com/app/barrier-kvm) | Works via Rosetta 2; no longer maintained | The issue contains a contributor's Rosetta test. The [official 2.4.0 release notice](https://github.com/debauchee/barrier/releases/tag/v2.4.0) confirms discontinued maintenance. A community ARM build does not establish an official native stable release. Keep the listing. |

Both live pages were fetched directly and their headlines and evidence links
matched `README.md`. Search's cached Synergy page still showed the older release
candidate headline, so the direct response was used for verification.
No Mac application was run and no binary was independently inspected.
No app data was changed, no duplicate announcement was posted, and the issue
remains open for the requested maintainer review.

To repeat the trial in Claude Code, run:

```text
/pstack:poteto-mode Recheck issue #261 using doesitarm-app-review. Read the current comments and primary sources, verify both public listings, and make only evidence-supported corrections. Keep the issue open for maintainer review.
```

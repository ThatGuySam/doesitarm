# Does It ARM MCP server

Does It ARM has a public, read-only [Model Context Protocol](https://modelcontextprotocol.io) server. AI assistants can use it to check whether Mac apps, games and Homebrew formulae run natively on Apple silicon, run through Rosetta 2, or are unsupported. It needs no sign-in or API key.

- Endpoint (Streamable HTTP): `https://mcp.doesitarm.com/mcp`
- Fallback: `https://doesitarm-mcp.samcarlton.workers.dev/mcp`
- Info page: <https://mcp.doesitarm.com/>
- Server card: <https://mcp.doesitarm.com/.well-known/mcp/server-card.json>

## Install

**Claude (claude.ai, desktop and mobile):** Settings → Connectors → Add custom connector, then paste `https://mcp.doesitarm.com/mcp`.

**Claude Code:**

```sh
claude mcp add --transport http doesitarm https://mcp.doesitarm.com/mcp
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "doesitarm": { "url": "https://mcp.doesitarm.com/mcp" }
  }
}
```

**VS Code** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "doesitarm": { "type": "http", "url": "https://mcp.doesitarm.com/mcp" }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `search_apps` | Search listings by name, alias or bundle ID. Filters: `kind` (app, game, homebrew, all), `status`, `limit`. |
| `get_app` | Full public details for one listing by name, slug or doesitarm.com URL. Also works for Mac device pages. |
| `check_apps` | Check up to 50 app names in one call. Returns the best match and status for each, or "not listed". |
| `list_categories` | Categories with listing counts and overall native/Rosetta percentages. |
| `list_by_category` | Listings in one category, with optional `status` filter and paging. |
| `recent_updates` | Most recently updated app listings, newest first. |
| `list_devices` | Apple silicon Macs that have device pages. |

Every tool is marked read-only. Results are short text plus `structuredContent`, and every result links to its doesitarm.com page.

## What it returns, and what it leaves out

The server returns what a visitor sees when a listing page first loads: name, status headline, category, aliases, last update, links, per-device support, related videos, game reports, and the bundle version history (bundle ID, version, status and supported architectures).

It never returns the raw scan data that pages keep behind the **Full Info Plist** and **Full Meta Details** toggles (Info.plist contents and Mach-O metadata), or upload file names and scan dates.

## How it works

The Worker lives in [`workers/mcp`](../workers/mcp). It is stateless and reads the same public JSON the site is built from (`https://api.doesitarm.com/app-list.json`, `/game-list.json`, `/homebrew-list.json`, `/device-list.json`, `/api/kind/index.json` and the per-listing `/api/<kind>/<slug>.json`). Responses from the API are cached at the edge for 10 minutes. Each IP is limited to 120 MCP requests a minute.

```sh
cd workers/mcp
npm ci
npm test                                        # unit tests with fixture data
node scripts/smoke.mjs https://mcp.doesitarm.com/mcp   # live check
npx wrangler deploy                             # manual deploy
```

Pushes to `master` that touch `workers/mcp/**` run the tests, deploy, and smoke test the live endpoint (`.github/workflows/deploy-cloudflare-mcp.yml`).

`workers/mcp/server.json` is a draft entry for the [official MCP registry](https://registry.modelcontextprotocol.io) under the `com.doesitarm` namespace. It has not been published.

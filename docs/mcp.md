# Does It ARM MCP server

Check Apple Silicon compatibility for Mac apps, games, and Homebrew formulae. The public Does It ARM [MCP](https://modelcontextprotocol.io) server is read-only and requires no account. Connect over Streamable HTTP at `https://mcp.doesitarm.com/mcp`.

- Endpoint (Streamable HTTP): `https://mcp.doesitarm.com/mcp`
- Fallback: `https://doesitarm-mcp.samcarlton.workers.dev/mcp`
- Info page: <https://mcp.doesitarm.com/>
- Server card: <https://mcp.doesitarm.com/mcp/server-card> (experimental extension format; see [Server card](#server-card))
- Legacy server card: <https://mcp.doesitarm.com/.well-known/mcp/server-card.json> (kept for existing readers)

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

Server `com.doesitarm/mcp` version 1.2.0. The live `tools/list` response is the source of truth; this table mirrors it.

| Tool | Title | What it does |
| --- | --- | --- |
| `search_apps` | Search Apple Silicon Compatibility | Find listings for a Mac app, game, or Homebrew formula by name, alias, or bundle ID. Returns ranked candidates with status and links. Inputs: `query`, `kind` (app, game, homebrew, all; default all), `status`, `limit` (1–50, default 10). `total` can exceed the number returned. |
| `get_app` | Get Compatibility Listing Details | Read one listing for a Mac app, game, formula, or Mac model. A Does It ARM listing path or URL identifies the catalog record directly. A name or slug can resolve to the best catalog match. Inputs include `app` and `kind` (`app`, `game`, `homebrew`, `device`, `all`). Results include up to 10 scanned versions per bundle and up to 10 related videos per listing, where available. |
| `check_apps` | Compare Apple Silicon Compatibility | Check up to 50 names in one call. Returns the best match and status for each distinct name, or marks it as not listed with up to two closest names. Blank entries are skipped; identical trimmed names are checked once. |
| `list_categories` | List Compatibility Categories | Category slugs, listing counts and page links, plus overall percentages when available. |
| `list_by_category` | Browse Compatibility by Category | One category page, optional `status` filter, `limit` (1–100, default 25) and `offset`. Pass `nextOffset` back as `offset` for the next page; `null` means the last page. |
| `recent_updates` | List Recent App Compatibility Updates | Most recently updated Mac app listings, newest first. `limit` 1–100, default 20. |
| `list_devices` | List Apple Silicon Mac Models | Mac models with device pages: names, chips, availability dates and links. |

Statuses: `native` (native support), `rosetta` (Rosetta 2), `no` (unsupported), `no-in-progress` (support in progress), `unreported` (native support has yet to be reported). A name that is not listed means compatibility is unknown from this catalog, not that the software is unsupported.

Every tool is marked read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`). The open-world hint is set because the tools read the public first-party Does It ARM catalog: they send requests only to the configured catalog API, listing URLs identify catalog records, and they perform no arbitrary website fetches or writes.

### Results and errors

Each result is a short Markdown text plus `structuredContent`, and every tool declares an `outputSchema` that the structured result matches. `get_app` and `list_by_category` have a `found` flag: `found: false` means no listing or unknown category, and is an ordinary result, not an error. A search with no match returns `total: 0`.

Recoverable argument problems come back as `isError: true` with the field and valid range, for example `limit must be a whole number from 1 to 50. Omit it to use the default of 10.` If the catalog API fails, the tool returns `The Does It ARM catalog is temporarily unavailable. Retry in a moment, or consult https://doesitarm.com/.` and the details go to the Worker logs. Rate-limited requests get HTTP 429 with `Retry-After`.

### Examples

- "Can Spotify run natively on an M-series Mac?" → `search_apps { "query": "Spotify" }` or `get_app { "app": "Spotify" }`
- "Find the Homebrew formula ffmpeg" → `get_app { "app": "ffmpeg", "kind": "homebrew" }`
- "Check Spotify and Docker before I switch Macs" → `check_apps { "names": ["Spotify", "Docker"] }`
- "What chips are in the Macs you cover?" → `list_devices {}`

If an app you need is not listed, you can request it at <https://github.com/ThatGuySam/doesitarm/issues>.

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

## Server card

`https://mcp.doesitarm.com/mcp/server-card` serves a card in the [server card extension](https://github.com/modelcontextprotocol/ext-server-card) format (SEP-2127) as `application/mcp-server-card+json`. It carries the same name, version, description, icon, repository and remote as `server.json`, plus the two tested protocol versions, and validates against the extension repository's schema. The extension is still marked experimental and its `$schema` URL does not resolve yet, so the card is not advertised through `/.well-known/ai-catalog.json`. Add the AI Catalog once the schema resolves and a client can read the card. Live `tools/list` stays the source of truth for tools.

`/.well-known/mcp/server-card.json` is a legacy card from an earlier, closed proposal. It stays up for existing readers, without the dead `$schema` URL or capability claims.

Since 1.2.0 the runtime `serverInfo.name` is `com.doesitarm/mcp` (it was `doesitarm`), matching the registry and the card. The title stays "Does It ARM". `serverInfo` also carries the 256x256 PNG icon at `https://doesitarm.com/images/mcp-icon-256.png`.

## Registry entry

`workers/mcp/server.json` is the entry for the [official MCP registry](https://registry.modelcontextprotocol.io) as `com.doesitarm/mcp` (domain auth over HTTP at doesitarm.com). It validates against the 2025-12-11 server schema and its name, version and icon match the runtime `serverInfo`. Version 1.2.0 is the first published version. Registry versions are immutable, so bump the version in `server.json`, `src/server.js` and `package.json` together before publishing.

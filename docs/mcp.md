# Does It ARM MCP server

Check Apple Silicon compatibility for Mac apps, games, and Homebrew formulae. The public Does It ARM [MCP](https://modelcontextprotocol.io) server is read-only and requires no account. Connect over Streamable HTTP at `https://mcp.doesitarm.com/mcp`.

- Endpoint (Streamable HTTP): `https://mcp.doesitarm.com/mcp`
- Inventory REST endpoint: `POST https://mcp.doesitarm.com/v1/inventory`
- Fallback: `https://doesitarm-mcp.samcarlton.workers.dev/mcp`
- Info page: <https://mcp.doesitarm.com/>
- Server card: <https://mcp.doesitarm.com/mcp/server-card> (experimental extension format; see [Server card](#server-card))
- Legacy server card: <https://mcp.doesitarm.com/.well-known/mcp/server-card.json> (kept for existing readers)
- Privacy Policy: <https://doesitarm.com/privacy> (see “The MCP server and inventory API”)
- Terms of Use: <https://doesitarm.com/terms>

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

Server `com.doesitarm/mcp` version 1.3.0. The live `tools/list` response is the source of truth; this table mirrors it.

| Tool | Title | What it does |
| --- | --- | --- |
| `search_apps` | Search Apple Silicon Compatibility | Find listings for a Mac app, game, or Homebrew formula by name, alias, or bundle ID. Returns ranked candidates with status and links. Inputs: `query`, `kind` (app, game, homebrew, all; default all), `status`, `limit` (1–50, default 10). `total` can exceed the number returned. |
| `get_app` | Get Compatibility Listing Details | Read one listing for a Mac app, game, formula, or Mac model. A Does It ARM listing path or URL identifies the catalog record directly. A name or slug can resolve to the best catalog match. Inputs include `app` and `kind` (`app`, `game`, `homebrew`, `device`, `all`). Results include up to 10 scanned versions per bundle and up to 10 related videos per listing, where available. |
| `check_apps` | Compare Apple Silicon Compatibility | Check up to 50 names in one call. Returns the best match and status for each distinct name, or marks it as not listed with up to two closest names. Blank entries are skipped; identical trimmed names are checked once. |
| `list_categories` | List Compatibility Categories | Category slugs, listing counts and page links, plus overall percentages when available. |
| `list_by_category` | Browse Compatibility by Category | One category page, optional `status` filter, `limit` (1–100, default 25) and `offset`. Pass `nextOffset` back as `offset` for the next page; `null` means the last page. |
| `recent_updates` | List Recent App Compatibility Updates | Most recently updated Mac app listings, newest first. `limit` 1–100, default 20. |
| `list_devices` | List Apple Silicon Mac Models | Mac models with device pages: names, chips, availability dates and links. |
| `check_inventory` | Check Mac App Inventory for Apple Silicon | Check raw Mac app exports or app-only rows against the catalog, bundle ID first. Returns compatibility totals, paged app/version/build results with evidence and listing links, and device counts for raw exports when available. See [Bulk inventory](#bulk-inventory-check_inventory). |

Statuses: `native` (native support), `rosetta` (Rosetta 2), `no` (unsupported), `no-in-progress` (support in progress), `unreported` (native support has yet to be reported). A name that is not listed means compatibility is unknown from this catalog, not that the software is unsupported.

Every tool is marked read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`). The open-world hint is set because the tools read the public first-party Does It ARM catalog: they send requests only to the configured catalog API, listing URLs identify catalog records, and they perform no arbitrary website fetches or writes.

### Results and errors

Each result is a short Markdown text plus `structuredContent`, and every tool declares an `outputSchema` that the structured result matches. `get_app` and `list_by_category` have a `found` flag: `found: false` means no listing or unknown category, and is an ordinary result, not an error. A search with no match returns `total: 0`.

Recoverable argument problems come back as `isError: true` with the field and valid range, for example `limit must be a whole number from 1 to 50. Omit it to use the default of 10.` If the catalog API fails, the tool returns `The Does It ARM catalog is temporarily unavailable. Retry in a moment, or consult https://doesitarm.com/.` Rate-limited requests get HTTP 429 with `Retry-After`.

### Examples

- "Can Spotify run natively on an M-series Mac?" → `search_apps { "query": "Spotify" }` or `get_app { "app": "Spotify" }`
- "Find the Homebrew formula ffmpeg" → `get_app { "app": "ffmpeg", "kind": "homebrew" }`
- "Check Spotify and Docker before I switch Macs" → `check_apps { "names": ["Spotify", "Docker"] }`
- "What chips are in the Macs you cover?" → `list_devices {}`
- "Here is our reviewed osquery app projection, which apps need validation for macOS 28?" → `check_inventory { "csv": "name,bundle_identifier,bundle_short_version,bundle_version\nSlack,com.tinyspeck.slackmacgap,4.41.105,441050", "target_macos": 28 }`

If an app you need is not listed, you can request it at <https://github.com/ThatGuySam/doesitarm/issues>.

## Bulk inventory (`check_inventory`)

`check_inventory` accepts raw Mac app exports and app-only rows. The [local inventory importer](../tools/inventory-import/README.md) can prepare an app-only projection for review on the workstation and join catalog evidence back to a local report.

The [Does It ARM inventory Agent Skill](../skills/doesitarm-inventory/SKILL.md) guides the same review and lookup in Claude Code or Codex. Copy its directory into your project's `.claude/skills/` or `.agents/skills/` respectively.

For a simple lookup of up to 50 titles, use `check_apps`.

### Input and limits

The input is exactly one of `rows`, `csv`, or `json`. Undeclared arguments and fields inside `rows` are rejected.

| Argument | Rules |
| --- | --- |
| `rows` | 1–250 objects with optional string fields `name` (≤160 characters), `bundle_id` (≤255), `version` (≤80), `build` (≤80), `publisher` (≤160). Each row needs a nonblank `name` or `bundle_id`. Versions are strings, so leading zeroes and suffixes survive. |
| `csv` | A supported raw delimited export, or app-only CSV or TSV with the headers below. |
| `json` | Jamf Pro inventory or `system_profiler` JSON as text, an object, or an array. Keep versions and builds as strings. |
| `format` | Optional raw export profile for `csv` or `json`. Omit it to detect the profile from the file headers or JSON shape. |
| `target_macos` | Optional 26, 27 or 28. Adds a `target_assessment` per row. 28 is the first release without general-purpose Rosetta 2, so a Rosetta row gets `rosetta_unavailable`. Omit it for architecture evidence only. |
| `filter` | `all` (default), `native`, `rosetta`, `unsupported` or `unknown`. Counts always cover the whole batch. |
| `offset`, `limit` | `offset` defaults to 0 and can be as high as 4999 for raw exports or 249 for app-only inputs. `limit` is 1–50 and defaults to 20. Pages follow input order. The next page uses the same input, target and filter with `next_offset` and the first page's `catalog_revision`. |
| `catalog_revision` | Optional, from the first page. If the catalog has changed since, the call returns an error and the batch restarts at offset 0. |

Recognized raw exports allow up to 1 MiB and 5,000 raw data records before grouping. App-only `rows`, CSV and TSV allow up to 250 rows and 64 KiB of UTF-8 input, with 96 KiB for serialized MCP arguments. Invalid records are reported by row number and code in `invalid_rows`, up to 10, with the full count in `counts.invalid`. Validation errors identify the field, row number or bound without repeating the submitted values.

#### Raw export profiles

| Format | Report |
| --- | --- |
| `jamf-pro-applications` | Jamf Pro Applications CSV with `Application Name`, `Version` and `Computer Name`, including continuation rows. |
| `jamf-pro-inventory` | Jamf Pro v4 computer inventory JSON with `applications` on a computer, in an array of computers, or under `results`. |
| `iru-prism-apps` | Iru (Kandji) Prism Apps CSV with `name`, `bundle_id` and `short_version`. Auto-detection also looks for a device column. |
| `intune-discovered-apps` | Intune discovered apps CSV with `ApplicationName`, `ApplicationVersion` and `Platform`. The adapter selects macOS rows. |
| `fleet-csv` | Fleet osquery apps CSV with `name`, `bundle_identifier` and `bundle_short_version`. Auto-detection also looks for `host_id` or `host_display_name`. |
| `jumpcloud-system-app` | JumpCloud `Get-JCSystemApp` CSV with system ID, OS and software fields. The adapter selects macOS rows. |
| `munkireport-applications` | English MunkiReport Applications CSV with both `Name` columns, `Serial Number`, `Bundle ID`, `Bundle Version` and `Architecture`. |
| `system-profiler-json` | Output of `system_profiler SPApplicationsDataType -json` from one Mac. |

The importer’s [profile guide](../tools/inventory-import/README.md#input-profiles) records which vendor shapes were checked against synthetic fixtures and which still need tenant verification.

#### App-only CSV headers

App-only CSV or TSV accepts a BOM, CRLF and quoted fields. Headers are matched case-insensitively, ignoring spaces and punctuation. Extra columns and two headers that map to the same field cause a validation error.

| Field | Accepted headers |
| --- | --- |
| `name` | `name`, `app_name`, `ApplicationName` (Intune), `display_name`, `title` |
| `bundle_id` | `bundle_id`, `bundleId` (Jamf, Iru), `bundle_identifier` (osquery, Fleet), `CFBundleIdentifier` |
| `version` | `version`, `short_version` (Iru Prism), `bundle_short_version` (osquery), `cfBundleShortVersionString`, `ApplicationVersion` (Intune) |
| `build` | `build`, `bundle_version` (osquery), `cfBundleVersion`, `build_version` |
| `publisher` | `publisher`, `ApplicationPublisher` (Intune), `vendor`, `developer` |

A generic `version` column is always read as the short version, never as the build.

### Matching and statuses

1. A row's `bundle_id` is matched first, case-insensitively, against the bundle IDs on catalog listings. The public app list carries bundle IDs for most, but not all, Mac app listings.
2. A bundle ID the catalog does not know never borrows a status from a name. If the row's name matches listings that have other bundle IDs, the row is `unknown` with `bundle_id_conflict` and those listings as `candidates`.
3. Rows without a usable bundle ID match on exact name or alias (case, whitespace and a terminal `.app` are normalized). A name alone does not establish which build is installed, so those rows stay `unknown` with `ambiguous_identity`. A unique match carries the latest listing in `catalog_hint`; several matches list up to three `candidates`.
4. For a bundle-ID match with an installed version:
   - `native` with `evidence.basis: "catalog_statement"` when the listing reports native support "as of" a version and the installed version is the same or newer (leading dotted numbers compared).
   - Otherwise the exact installed version or build is looked up in the listing's ten most recent scanned versions for that bundle ID (the same projection `get_app` returns), for up to 25 listings per call. A universal or arm64 scan gives `native`, an Intel-only scan gives `rosetta`, both with `basis: "binary_architecture"` and the scanned architectures. If scans of the same version disagree, or the bundle has shipped separate Intel-only and Apple Silicon-only builds, the row stays `unknown` with `conflicting_variants`.
   - Everything else is `unknown`: `version_missing`, `version_unverified` (no version-scoped evidence for that version, including versions older than the "as of" version) or `insufficient_evidence` (listing not yet reported).
5. `catalog_hint` always shows the latest listing status for triage and is never applied to the installed version. Listings reported as Rosetta or unsupported rarely name a version, so those rows usually stay `unknown` with that status in the hint. `unsupported` needs version-scoped evidence, which the current catalog does not have, so expect it to be 0 for now.

Rows are deduplicated by bundle ID (or name plus publisher), version and build. The top-level status counts measure tuples. `received = accepted + invalid`, `unique = accepted - duplicates`, and the four status counts sum to `unique`. Each result identifies the first input `row` and lists `duplicate_rows`. For raw CSV, `row` is the file line where that record ends. For other inputs, it is the one-based app row position. App-only results join back to the submitted app by row number.

Raw results include the detected or selected `format`, the `app` identity, and a `device_count` for each tuple. Counts come from distinct device IDs, distinct labels where IDs are absent (provisional), or an unambiguous provider count. A `system_profiler` export counts as one Mac. `null` indicates insufficient information to count devices reliably. A device may appear in several tuples.

When the batch has unknown rows, `scanner_reference` holds a fixed reference to [Does It ARM App Scanner v3 (preview)](https://doesitarm.com/apple-silicon-app-test/?v=3), which inspects Mach-O architectures of selected Mac apps or folders locally and can export the results to a file. Scanner results stay on that Mac and are not added to the public catalog (`catalog_submission: "unavailable"`). The reference never contains values from the input.

### Data handling

The Worker processes MCP inputs and REST uploads in memory and does not log, cache, or store them. Device IDs or labels are used only for counting within the request. Device values, including paths, users and serials, are excluded from results and errors. Worker invocation logs are disabled, and only public catalog data is cached. An MCP client or AI assistant can see an export sent through it. The local importer keeps the raw export on the workstation and sends only reviewed app tuples.

## REST inventory API

`POST https://mcp.doesitarm.com/v1/inventory` accepts a raw file body with `Content-Type: text/csv` or `application/json`, or a multipart upload with one file field named `file`. Direct and multipart files accept UTF-8 and BOM-marked UTF-16. The [raw export profiles](#raw-export-profiles) and limits are the same as for MCP. The JSON response body matches the tool’s `structuredContent`.

Optional query parameters are `format`, `limit` and `offset`. A later page sends the same file with `offset` set to `next_offset`. CORS allows any origin. MCP and REST share the 120-requests-per-minute limit per IP. Errors return a JSON object with an `error` message, including HTTP 413 for oversized raw uploads and HTTP 429 when rate limited.

```sh
curl -H 'Content-Type: text/csv' --data-binary @fleet-report.csv \
  'https://mcp.doesitarm.com/v1/inventory?format=fleet-csv&limit=20'

system_profiler SPApplicationsDataType -json > apps.json
curl -H 'Content-Type: application/json' --data-binary @apps.json \
  'https://mcp.doesitarm.com/v1/inventory'

curl -F 'file=@jamf-applications.csv;type=text/csv' \
  'https://mcp.doesitarm.com/v1/inventory?format=jamf-pro-applications&limit=20&offset=20'
```

## What it returns, and what it leaves out

The server returns what a visitor sees when a listing page first loads: name, status headline, category, aliases, last update, links, per-device support, related videos, game reports, and the bundle version history (bundle ID, version, status and supported architectures).

`check_inventory` reuses the same ten-version projection and adds nothing from the raw scan.

It never returns raw scan data (Info.plist contents, Mach-O metadata), upload file names or scan dates. Since November 27, 2026 the public API itself publishes only the scan fields in [`helpers/scan-allowlist.js`](../helpers/scan-allowlist.js), and architectures are names such as `arm64` and `x86_64`.

## How it works

The Worker lives in [`workers/mcp`](../workers/mcp). It is stateless and reads the same public JSON the site is built from (`https://api.doesitarm.com/app-list.json`, `/game-list.json`, `/homebrew-list.json`, `/device-list.json`, `/api/kind/index.json` and the per-listing `/api/<kind>/<slug>.json`). Public catalog responses are cached at the edge for 10 minutes.

```sh
cd workers/mcp
npm ci
npm test                                        # unit tests with fixture data
node scripts/smoke.mjs https://mcp.doesitarm.com/mcp   # live check
npx wrangler deploy                             # manual deploy
```

Pushes to `master` that touch `workers/mcp/**` or `tools/inventory-import/**` run the Worker tests, deploy, and smoke test the live endpoint (`.github/workflows/deploy-cloudflare-mcp.yml`).

## Server card

`https://mcp.doesitarm.com/mcp/server-card` serves a card in the [server card extension](https://github.com/modelcontextprotocol/ext-server-card) format (SEP-2127) as `application/mcp-server-card+json`. It carries the same name, version, description, icon, repository and remote as `server.json`, plus the two tested protocol versions, and validates against the extension repository's schema. The extension is still marked experimental and its `$schema` URL does not resolve yet, so the card is not advertised through `/.well-known/ai-catalog.json`. Add the AI Catalog once the schema resolves and a client can read the card. Live `tools/list` stays the source of truth for tools.

`/.well-known/mcp/server-card.json` is a legacy card from an earlier, closed proposal. It stays up for existing readers, without the dead `$schema` URL or capability claims.

Since 1.2.0 the runtime `serverInfo.name` is `com.doesitarm/mcp` (it was `doesitarm`), matching the registry and the card. The title stays "Does It ARM". `serverInfo` also carries the 256x256 PNG icon at `https://doesitarm.com/images/mcp-icon-256.png`.

## Registry entry

`workers/mcp/server.json` is the entry for the [official MCP registry](https://registry.modelcontextprotocol.io) as `com.doesitarm/mcp` (domain auth over HTTP at doesitarm.com). It validates against the 2025-12-11 server schema and its name, version and icon match the runtime `serverInfo`. Version 1.2.0 was the first published version. Version 1.3.0 added `check_inventory`. Version 1.4.0 adds raw export support and the REST inventory endpoint. Registry versions are immutable, so bump the version in `server.json`, `src/server.js`, `package.json` and the `package-lock.json` root together before publishing. MCP hosts that pin tool definitions may need a rescan.

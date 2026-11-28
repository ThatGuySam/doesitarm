# doesitarm-mcp

Check Apple Silicon compatibility for Mac apps, games, and Homebrew formulae. The public Does It ARM MCP server is read-only and requires no account. Connect over Streamable HTTP at https://mcp.doesitarm.com/mcp. See the [tool reference and examples](https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md).

See [docs/mcp.md](../../docs/mcp.md) for install snippets, tools, data rules and deploy steps.

## Bulk inventory

The [local inventory importer](../../tools/inventory-import/README.md) prepares a reviewed app-only projection and uses the same adapters as the Worker. The [inventory Agent Skill](../../skills/doesitarm-inventory/SKILL.md) documents that workflow for Claude Code and Codex.

`check_inventory` accepts up to 250 app-only rows or 5,000 raw export records (1 MiB). Eight [raw profiles](../../docs/mcp.md#raw-export-profiles) cover Jamf Pro CSV and JSON, Iru Prism, Intune, Fleet, JumpCloud, MunkiReport, and `system_profiler` JSON. Format detection is automatic when `format` is omitted. Compatibility results are paged by app, version and build. Raw exports include device counts when the report provides enough information.

## REST inventory API

`POST https://mcp.doesitarm.com/v1/inventory` returns the same JSON as `check_inventory`’s `structuredContent`. It supports CORS and shares the MCP rate limit of 120 requests per minute per IP. The Worker does not store, cache, or log uploads. Device IDs and labels are used only to count devices during a request.

```sh
curl -H 'Content-Type: text/csv' --data-binary @fleet-report.csv \
  'https://mcp.doesitarm.com/v1/inventory?format=fleet-csv&limit=20'

curl -H 'Content-Type: application/json' --data-binary @system-profiler.json \
  'https://mcp.doesitarm.com/v1/inventory'

curl -F 'file=@jamf-applications.csv;type=text/csv' \
  'https://mcp.doesitarm.com/v1/inventory?offset=20'
```

The next page sends the same file with `offset` set to `next_offset`. See the [API reference](../../docs/mcp.md#rest-inventory-api) for limits and count semantics.

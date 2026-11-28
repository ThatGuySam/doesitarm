# doesitarm-mcp

Check Apple Silicon compatibility for Mac apps, games, and Homebrew formulae. The public Does It ARM MCP server is read-only and requires no account. Connect over Streamable HTTP at https://mcp.doesitarm.com/mcp. See the [tool reference and examples](https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md).

See [docs/mcp.md](../../docs/mcp.md) for install snippets, tools, data rules and deploy steps.

## Bulk inventory

`check_inventory` checks up to 250 rows from a Mac app inventory export (structured `rows` or a headered CSV/TSV string, 64 KiB max), matching bundle ID first. It returns whole-batch counts for native, Rosetta, unsupported and unknown plus paged per-row results with evidence and listing links. Name-only rows stay unknown with the latest listing as a hint. Batches with unknown rows include a fixed reference to [App Scanner v3 (preview)](https://doesitarm.com/apple-silicon-app-test/?v=3), whose local scan results are not added to the public catalog. Rows are not logged or cached.

Fleet / osquery export (paste the CSV with headers as `csv`):

```sql
SELECT DISTINCT
  trim(name) AS name,
  NULLIF(trim(bundle_identifier), '') AS bundle_id,
  NULLIF(trim(bundle_short_version), '') AS version,
  NULLIF(trim(bundle_version), '') AS build
FROM apps
WHERE length(trim(COALESCE(name, ''))) > 0
   OR length(trim(COALESCE(bundle_identifier, ''))) > 0
ORDER BY name, bundle_id, version, build;
```

Header aliases, limits, statuses and the Jamf, Iru and Intune recipes are in [docs/mcp.md](../../docs/mcp.md#bulk-inventory-check_inventory).

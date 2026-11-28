# Does It ARM inventory importer

Check a Mac app inventory locally before sharing public app tuples with the [Does It ARM compatibility catalog](../../docs/mcp.md#bulk-inventory-check_inventory). The importer runs with Node.js 22 or newer and uses two pinned parsers. Its code is [MIT-licensed](LICENSE). The install command fetches dependencies from npm. The importer has no telemetry and opens a network connection only in `--lookup` mode.

## Review and check an inventory

Run from a reviewed checkout of this repository. Keep your export and private output in a directory your organization approves.

```sh
npm --prefix tools/inventory-import ci --ignore-scripts --no-audit --no-fund
node tools/inventory-import/import.mjs --format fleet-csv fleet.csv --review review.json --local-report local.json
```

Open `review.json` locally in a text editor. Remove every tuple with a private app name, bundle ID, version, build, or publisher, and save the reviewed JSON array as `approved.json`. The importer matches exact tuples from this file to the re-read inventory. Approval applies to every field in a tuple. The original report, the review file before editing, and the local counts and architecture report can contain sensitive information. Keep them out of assistant attachments and terminal output captured by assistants. The review command writes files with owner-only permissions and keeps stdout empty.

```sh
node tools/inventory-import/import.mjs --format fleet-csv fleet.csv --approved approved.json --dry-run
node tools/inventory-import/import.mjs --format fleet-csv fleet.csv --approved approved.json --lookup > joined.json
```

`--dry-run` prints each initial JSON-RPC request body verbatim on its own line. A lookup may add page requests with the same app input plus the offset and revision returned by MCP. `--lookup` POSTs the approved app fields to `https://mcp.doesitarm.com/mcp` and joins the results back to local counts and architecture. The joined JSON includes the app, installed version and build, a labeled count, status, catalog native-as-of version when present, evidence links and the catalog revision used for that row. Catalog candidates are separate when the app identity is uncertain. Set `--target-macos 26|27|28` with the same value when previewing and checking a macOS upgrade.

Use `--emit` in place of `--lookup` for offline export. With the default `--wire rows`, stdout is a JSON object ready to use as `check_inventory` arguments. With `--wire csv`, stdout is headered CSV ready to pass as the `csv` argument. Use a plain text editor to inspect CSV, since spreadsheets may interpret formula-like cells. For multiple batches, use `--output-dir NEW_DIRECTORY` to get one file per batch. Each batch has up to 250 tuples, 64 KiB of input and 96 KiB of serialized arguments, including space for pagination. A batch has up to 25 distinct bundle IDs to stay within the catalog's listing-detail budget. A revision change restarts that batch once. Every joined row carries its own revision.

## Input profiles

Select a profile explicitly. Delimited inputs accept UTF-8, UTF-8 BOM, and BOM-marked UTF-16. Use `--encoding` for other known encodings and `--delimiter comma|tab|semicolon` if detection is ambiguous. Version and build fields are text. For JSON, retain version numbers as strings.

| Profile | Shape and version fields | Verification |
| --- | --- | --- |
| `jamf-pro-applications` | Grouped **Reports → Applications** CSV/TSV with `Application Name`, `Version`, `Computer Name`. Continuations fill down within the current group. Computer names give provisional counts. | Tenant headers and bytes are **unverified**. The alternate `Application` header requires tenant confirmation and `--verified-headers`. |
| `jamf-pro-inventory` | v4 JSON with `results[].applications[]` or a computer detail response. Uses `bundleId`, `cfBundleShortVersionString`, and `cfBundleVersion`. | Tested with a synthetic API response. Enable a generic `version` fallback with `--verified-version` after confirming it is the release version. |
| `iru-prism-apps`, `iru-prism-json` | Mac-scoped Prism Apps CSV using API field names, or a JSON array / `results` wrapper. Uses `name`, `bundle_id`, `short_version`, and locally `device_id`, `device__id`, or `serial_number`. | Tenant CSV labels and bytes are **unverified**. Use `--verified-build` only after confirming `version` is the build. |
| `intune-discovered-apps`, `intune-graph` | CSV from the AppInv family or Graph `detectedApp` JSON (`value[]` or array). Uses `ApplicationName`, `ApplicationVersion`, `ApplicationPublisher`, or Graph `displayName`, `version`, `publisher`. Filters by platform. When the export omits it, confirm Mac scope with `--mac-only`. | Raw portal headers and bytes are **unverified**. Use `--verified-version` on CSV only after confirming `ApplicationShortVersion` against a known install. |
| `fleet-csv`, `fleet-json` | Mac Fleet saved/live report CSV or JSON, or osquery `apps` output. Uses `name`, `bundle_identifier`, `bundle_short_version`, `bundle_version`. JSON reads `host_id`, CSV reads provisional host labels. | For SQL that intentionally aliases `bundle_short_version` to `version`, use `--verified-version`. Fleet Software Inventory UI CSV is **unverified**. |
| `jumpcloud-system-app`, `jumpcloud-system-insights` | Mac **Get-JCSystemApp** CSV with `SystemID`, `SystemOS`, `SoftwareName`, `SoftwareVersion`, and `SoftwareVendor`, or the Mac System Insights `apps` JSON array. JSON maps the osquery fields and uses `system_id` locally. | The cmdlet profile uses the documented header signature, including with a PowerShell `#TYPE` preamble. Tenant CSV bytes are **unverified**. |
| `munkireport-applications` | English Applications listing CSV. Uses the second `Name`, `Bundle ID`, collector `Bundle Version` as the release, and `Architecture` locally. Build is blank. | Tenant export bytes are **unverified**. Enable a `Version` fallback with `--verified-version` after confirming its semantics. Use a column map for customized or localized exports. |
| `system-profiler-json`, `system-profiler-plist` | `system_profiler SPApplicationsDataType -json` or `-xml`. Reads app names, versions and local architecture evidence. App records classified solely as iOS, web or other stay in the local report. | XML input is an Apple property list. Optionally use `--app-plists FILE` on the source Mac with a separate JSON array of approved absolute `.app/Contents/Info.plist` paths. The importer reads only those plists, associates them with the matching app path, and selects the bundle ID, short version and build. |
| `lansweeper-classic` | Stock **Installed Software by Computer** CSV with `Software`, `Version`, `Publisher`, and `AssetID`. Filter Mac by `AssetType` or `OS`, or verify the cohort and pass `--mac-only`. | Tenant CSV bytes and Platform Software headers are **unverified**. Map custom aliases explicitly. |
| `addigy-agent`, `addigy-mdm` | Installed Apps API `items[]` or array. Verify Mac scope and use `--mac-only`. Agent API uses `name` and `version`. MDM uses `name`, `identifier`, `short_version`. Reconcile the scope before comparing the two inventories. | Tenant CSV shape is **unverified**. MDM `version` requires `--verified-build` after checking its semantics. |
| `jamf-school` | Candidate mapping for device JSON with `includeApps=true` and `apps[]` containing `name`, `vendor`, `identifier`, `version`. | Mac payload is **unverified**. Confirm a Mac response before using `--verified-headers --mac-only`. |
| `mapped-csv` | For a confirmed installed-Mac-app export from Mosyle, Workspace ONE, Addigy CSV, a localized report, or another custom collector. Use `--mac-only --delimiter ... --columns FILE`. The JSON map uses one-based column numbers, for example `{"name":2,"bundle_id":3,"version":4,"device":1}`. The optional local keys are `device`, `label`, and `architecture`. | Vendor header or row grain is **unverified**. Verify each selected field, especially the bundle ID and the observed installed version. Use the upstream collector for Snipe-IT license exports. |

## Interpreting a local report

A tuple groups by case-folded bundle ID and exact trimmed release/build. Without an ID it groups by normalized name and publisher, with lower identity confidence. Counts are distinct devices where stable IDs exist, provisional distinct labels for hostname-only exports, or rows if identification is incomplete. Intune provider counts retain their source rows and optional `--cohort` label. Repeated or overlapping aggregate counts are shown separately. Architecture buckets can overlap, and summing app counts cannot yield a fleet total.

Local architecture evidence describes what the collector observed. Some MunkiReport versions render both iOS and native Apple Silicon as “Apple Silicon.” Check actual binary slices when that distinction affects rollout. A catalog claim of native support as of a release is shown in `native_as_of` as a lead. An Intel observation is retained alongside that claim, with the joined status marked unknown when the catalog reports native. A name-only result stays unknown for installed-version compatibility.

For Intel or uncertain installs, `native_availability` can show a same-version native variant when the public catalog returned a scoped binary observation. Use `--native-evidence FILE` to include a vendor-documented release or a scoped binary observation you verified locally. The evidence file is a JSON array with entries like this one. Keep `minimum_macos`, `channel`, and `candidate_build` absent when unverified.

```json
[
  {
    "installed": {"name":"Example App","bundle_id":"com.example.app","version":"1.0"},
    "status": "native_version_available",
    "candidate_version": "2.0",
    "candidate_build": "302",
    "architectures": ["arm64"],
    "channel": "stable",
    "source_url": "https://example.com/releases",
    "evidence_basis": "vendor",
    "minimum_macos": "13"
  }
]
```

Use `same_version_native_variant` for verified builds of the same release. The installed tuple must match the approved row exactly. Native candidate evidence stays local. A native candidate still needs rollout validation on the target macOS.

## Tests

```sh
npm --prefix tools/inventory-import test
```

The eight vendor-shaped fixture exports are synthetic. Test network responses are mocked.

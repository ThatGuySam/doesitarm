---
name: doesitarm-inventory
description: Check Mac app inventory for an Apple Silicon migration, Intel-only app cleanup, or macOS upgrade. Applies to MDM installed-app reports, osquery exports, and System Information Applications data.
---

# Does It ARM inventory

## 1. Identify the installed-app source

Confirm the source, Mac cohort, and report grain with the user. Use observed installed versions. For a purchase, license, or deployment report, ask for the installed-app export from the underlying collector. The [importer profile guide](https://github.com/ThatGuySam/doesitarm/blob/master/tools/inventory-import/README.md#input-profiles) covers vendor fields, export shapes and mappings that still need tenant verification. On the source Mac, `system_profiler SPApplicationsDataType -json` collects application versions and architecture.

## 2. Prepare and review locally

Have the admin run the [local importer](https://github.com/ThatGuySam/doesitarm/tree/master/tools/inventory-import) with `--format PROFILE --review review.json --local-report local.json` outside the assistant context. The admin should review the projection in a local editor, remove every tuple containing private software or other sensitive values, and save the approved array. Use an already minimized input in a cloud session. Keep raw exports, review files, device IDs, paths, users, and private app values out of assistant attachments, tool output, and prompts.

The public tuples contain only app name, confirmed bundle ID, short version, build, and optional publisher. Keep architecture buckets, device counts, and row references in the admin's local report. The importer labels provisional host counts and row counts. A computer's processor architecture describes the computer. App architecture requires app-level evidence.

## 3. Check and join

When the user and their environment allow remote lookup, the admin can run the importer with `--approved approved.json --dry-run` to see the outgoing bodies and `--lookup` to obtain a joined report locally. For already minimized app tuples, use [`check_inventory`](https://github.com/ThatGuySam/doesitarm/blob/master/docs/mcp.md#bulk-inventory-check_inventory) from the approved MCP connection at `https://mcp.doesitarm.com/mcp`. Each batch has up to 250 data rows, 64 KiB of UTF-8 input, and 96 KiB of serialized arguments. For each `next_offset`, resend the same batch and its `catalog_revision`. Restart from page one if the revision changes. Use an approved local catalog if the task calls for an offline lookup.

Report installed-version status and listing links for the approved tuples. Name-only matches and missing version-scoped evidence remain unknown. Keep local Intel and Universal observations visible even when the listing reports a native release. Present any verified native candidate with its version or build, architecture, channel, and minimum macOS where known. Cite the vendor or scoped binary observation and keep rollout compatibility separate. Account for all approved batches or identify the unresolved checks.

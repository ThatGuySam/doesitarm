# Audio plug-in directory

The directory and product routes render from the checked-in snapshot. A format verdict describes an inspected macOS bundle. Exact host matches use their own evidence.

## Refresh the publisher scan snapshot

Run this from the site root, using the private scan corpus and host matrix as inputs.

```sh
python3 -B scripts/import-plugin-corpus.py \
  /path/to/plugin-corpus-2026-11-27 \
  /path/to/plugin-host-matrix.csv \
  --checked-on 2026-11-27
python3 -B -m unittest discover -s test -p plugin_corpus_test.py
node --test test/plugin-hosts.node.mjs
```

The importer keeps exact vendor and observed product names as separate identities. Review alternate names, distinct editions and companion apps in [the identity crosswalk](../data/plugins/identity.json). The nested LoudMax module stays attached as supporting evidence. An app bundle with an unreviewed role stays out of the standalone and architecture summaries. The script uses the package ledger, when present, to check that each archive belongs to the corpus. Popularity entries can supply exact-name aliases and the repository catalogue can confirm repository URLs. Neither creates a scan result or a product page.

Keep existing identifiers and slugs stable across refreshes. The data retains the publisher tag separately from each bundle version and stores SHA-256 for the publisher archive. Product pages link to release or download pages and show the archive digest and filename. Member paths are retained for reconciliation in the JSON. Executable hashes remain null until those exact files are hashed.

Pass `--published-on YYYY-MM-DD` when recording a known date of substantive public changes. An identical recheck preserves a stored modification date. Launch entries without a known publication date omit sitemap `lastmod`. The frontend prebuild generates the plug-in child sitemap alongside the other sitemaps. The Pagefind build adds local records to the base catalogue.

## Add an exact host result

The imported capability rows supply the host format documentation shown on product pages. Add a loader path to [host-loader-paths.json](../data/plugins/host-loader-paths.json) only when the relevant matrix sources cover it. Add the reviewed exact host profile to [host-profiles.json](../data/plugins/host-profiles.json). The gate in [host-compatibility.mjs](../helpers/plugins/host-compatibility.mjs) and its [fixtures](../test/plugin-hosts.node.mjs) show the required IDs, version, edition, role, insert context, loader, process CPU, supported OS range, hardware and requirements.

Put the result in [host-outcomes.json](../data/plugins/host-outcomes.json), tied to the exact build, component, profile, and tested macOS build. Use a shareable source for reproduced discovery, instantiation and processing, or an explicit vendor qualification for the same build and setup. Record session recall separately. A reviewed blocking failure for the same configuration suppresses the match. The initial corpus has no qualified results.

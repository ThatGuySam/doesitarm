# Download page resolution

The scanner is adding a bounded, static path from a public download page to a Mac artifact. The page resolver proposes links with provenance. The Worker controls which links it follows and tests the file response before passing it to the range scanner.

Both research runs are available under `../doesitarm-data/download-pages` from the checkout's parent directory. The Sol sample contains 100 rows and 73 pages with header-verified candidates. The Astra sample contains 100 rows and 61 pages with one-byte range evidence. These counts use different verification criteria. Replay preserves both criteria and reports results by seat and exposure pattern.

The initial root limit is 2 MiB decoded. The research captures for Elgato and Figma exceeded 1 MiB in their original responses. Follow-up documents are limited to 512 KiB. The Worker budgets three redirects, three candidate actions and a single intermediate document level. All inputs, redirects and candidates are untrusted. Returned source evidence is inert text.

## Worker flow and limits

- `POST /api/resolve` accepts a JSON body with one user-supplied URL. It returns a decision, verified candidates and short evidence fields as JSON. `POST /api/scan-download` rechecks a chosen URL before handing its first range to the scanner. POST keeps submitted URLs out of API request paths. Direct links with an archive or Mach-O filename still use the existing browser-first scan and its fallback `GET /api/scan`.
- Discovery runs for at most 5 seconds. The root document is limited to 2 MiB and an intermediate document to 512 KiB. The resolver can follow three candidate or metadata actions total. At most one intermediate document can contribute a new set of candidates. Each HTTP chain can follow three redirects, with four redirects and ten origin transactions in total. DNS checks count toward a separate 24-subrequest discovery cap. The scan uses the existing 20-second deadline and 36-subrequest cap.
- The tokenizer retains up to 64 attributes per element, 8 KiB per attribute, and 96 open elements. It stops at 50,000 tokens, caps a structured script at 512 KiB and attempts no resource loads. It ignores document-supplied base tags. It rejects XML DTDs and resolves no external entities. Electron YAML uses a reader for scalar `files[].url` fields. The library's top 16 candidates include their score, reasons and evidence.
- Page-derived files must have plausible container MIME and filename evidence and a valid one-byte range. The total declared representation size must fit the configured anonymous cap, which defaults to 8 MiB in this worktree. This deliberately excludes many full Mac installers. The scan repeats the check and the core validates the actual container and Mach-O bytes.
- The original per-client limiter and isolate busy lock cover both entry points. New download routes use a shared request limiter and a per-target-host limiter at each Cloudflare location. They fail closed if those bindings are missing. Cloudflare's counters are approximate and local to each location. Set `PAGE_RESOLUTION_DISABLED=true` to disable the two new routes or `SCAN_DISABLED=true` to disable all URL scanning. [Cloudflare rate limiter locality](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#locality)
- The isolate holds up to 32 parsed public document results for revalidation, keyed by URL and strong ETag. Cache entries require explicit public cache headers and simple variation. The cache stores parsed results. The Worker probes files again after a document 304, requests identity encoding and omits cookies, authorization and referrer. An origin asking for backoff is temporarily blocked on that isolate. App Store and access handoffs produce a generic reason.
- Each destination is normalized, checked against the public host rules and looked up for public A and AAAA records. The Worker has `global_fetch_strictly_public` enabled. Worker Fetch resolves the hostname independently, so the DNS preflight cannot pin the actual peer. Cloudflare limits `resolveOverride` to same-zone hosts. The CLI resolves addresses through its HTTP connector and passes the checked addresses to the TCP connection. [Worker compatibility flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public) · [Worker Request configuration](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties)

## Resolvers and adapters

The library reads ordinary controls, immediate meta refresh, download and alternate links, JSON-LD, Next and Nuxt payloads, JSON assignments, and quoted URL strings in inline scripts. It carries Mac and architecture context from the control or platform section. It prefers Apple Silicon builds within a release, then universal and Intel builds. It keeps equally scored links in document order. Source archives, signatures, unrelated platforms and release notes are excluded. Installers described as bootstrappers carry that label. When several comparable products or releases still fit, the caller can ask the user to choose.

| Adapter | Evidence |
| --- | --- |
| GitHub | Public uploaded release assets or a same-project expanded-assets fragment. The tag from an explicitly pasted release is preserved. |
| GitLab, Codeberg and Gitea | Recognized provider hosts and project paths. The JSON adapter reads attached assets and skips generated source archives. |
| SourceForge | A project files directory or an explicit artifact ending in `/download`. The transport follows the bounded mirror redirects. |
| Sparkle, Electron and Tauri | Named appcast or update feed, full enclosures, Electron file entries and Tauri Darwin platform keys. |
| Homebrew | An exact cask page or a vendor and product match from the curated list. The JSON response must identify the expected cask and publisher. |
| Public file hosting | Dropbox file shares use the documented download mode. Drive preview and warning pages get a handoff. Explicit public Drive actions and MediaFire links qualify only after a successful file probe. |
| Mac App Store and managed distribution | The resolver reports a handoff to the store, membership service or vendor flow. |
| Publisher routes | A small set of reviewed public endpoints and platform routes covers Go, Zoom, JetBrains Toolbox, VS Code and Kodi. |

Add an adapter under `crates/page-resolver/src/adapters`. Match a public vendor and product path or a documented provider URL. Give each candidate an evidence locator, then use the common ranking and egress path. Include a small fixture for the public route and its closest decoy or gate. The isolated corpus replay uses the same worker planner and generated Wasm as the new API. It has no network transport.

## CLI and unresolved pages

```sh
cargo build --locked -j2 -p scan-cli
target/debug/scan-cli resolve https://example.com/download
target/debug/scan-cli resolve https://example.com/download --html snapshot.html
target/debug/scan-cli resolve https://example.com/download --html snapshot.html \
  --metadata release.json --metadata-url https://example.com/latest.json
```

The CLI treats results as ranked hints and prints JSON. Its optional metadata file must match a proposed feed or release endpoint. Live unresolved results append to `~/Code/doesitarm-data/scan-ledger/page-attempts.jsonl` or the file named by `--ledger`. Offline runs include the same record in JSON and append only when `--ledger` is supplied. The record uses the scanner ledger branch's schema keys and an `evidence` object for the HTML SHA-256, rules attempted, rejected links and page features. The Worker hashes the original and candidate URLs in its diagnostic record.

`scripts/self-heal-pages.sh sol/CASE` calls the offline `AGENT_CMD` with a task file as `$1`. It uses the trusted `sources` launcher from the scanner-sources worktree, or `HEAL_SANDBOX_BIN`, to confine the agent and validation with Landlock and seccomp. The harness copies the permitted adapter and regression patch into a separate clean tree. It applies the patch to the caller's worktree only when native resolver tests, the complete offline corpus and the selected case pass. Install the locked web dependencies and build the trusted launcher once before using it. Set `PAGE_CORPUS_DIR` or `WASM_BINDGEN` for non-default locations.

## Threat model

| Threat | Control | Test |
| --- | --- | --- |
| Literal, encoded or DNS-resolved private target | Strict public host parsing and public A/AAAA checks before each discovery hop | `public page contract rejects IP literals`, `validates every redirect and DNS outcome`, `resolver_rejects_special_address_ranges` |
| Rebinding and split DNS | Fresh discovery preflight, manual redirects and public-only Worker routing. Native CLI binds to its validated connector result. | Mocked mixed A/AAAA tests exercise the preflight. Live connection-time routing remains unverified. |
| Redirect chains, refresh loops and off-site documents | Visited URLs, HTTP hop and origin budgets, one intermediate document, same-host generic follow-ups | `bounds a chain of open redirects and detects a meta refresh loop`, `validates candidates and second-document links` |
| Huge bodies, stalls and decompression | Bounded streaming reads, abort, identity encoding and early length checks | `blocks large declared, streamed, endless and compressed bodies` |
| HTML/XML parser exhaustion | Tokenizer, nesting, attribute, script and input caps. XML rejects DTDs. | `rejects_non_public_urls_and_bounds_parser_work`, `bounds_single_tag_attributes_and_keeps_equal_ranks_in_source_order` |
| Link farms and request amplification | Candidate host threshold, three actions, per-client and per-host rate limits, request limiter, busy lock and kill switch | `HTML structure limits and link-farm refusal`, `caps candidate attempts`, `enforces client, global, per-host, busy and kill-switch controls` |
| Cache abuse, upstream throttling and operational privacy | Public-only ETag revalidation, backoff, generic JSON errors and hashed URL logs | `revalidates a small public parsed response`, `honors anonymous forge API rate limits`, `caps candidate attempts and hashes unresolved URLs` |
| MIME and length deception | Positive file MIME/suffix evidence, exact 206 probe, full-size cap and repeated scan checks | `accepts only bounded file responses and re-probes before a scan`, `rejects HTML, suspicious formats and unbounded files` |
| Interactive consent, credentials and script execution | GET-only egress, inert parsing, no forwarded credentials and vendor handoff for gates | `retains_public_trials_and_skips_download_post_forms`, `respects_store_and_consent_and_accepts_public_share_actions` |
| Display of untrusted source content | JSON-only transport. The browser uses text nodes and validates evidence links as HTTPS. | `candidate-link display validates HTTPS again`, Chromium page phases and handoffs |

## Browser behavior

Mac users start with Select Apps. Windows, Android, iPhone and iPadOS start with the URL form and a collapsed device picker. The browser recognizes touch-enabled Safari with a Macintosh identifier as iPadOS. A choice of input method persists locally. The drag hint stays hidden on touch.

A page lookup announces reading, the number of file responses found and the selected scan. When multiple downloads remain ambiguous, a picker shows the names, architecture labels and hosts. The source disclosure gives the link and the control or metadata field that supplied it. Gated pages and the Mac App Store offer the corresponding handoff.

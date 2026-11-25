# Download page resolution

The scanner resolves public download pages to Mac artifacts through bounded static parsing. The page resolver proposes links with provenance. The Worker controls which links it follows and tests the file response before passing it to the range scanner.

Both research runs are available under `~/Code/doesitarm-data/download-pages`. The Sol sample contains 100 rows and 73 pages with header-verified candidates. The Astra sample contains 100 rows and 61 pages with one-byte range evidence. These counts use different verification criteria. Replay preserves both criteria and reports results by seat and exposure pattern.

The initial root limit is 2 MiB decoded. The research captures for Elgato and Figma exceeded 1 MiB in their original responses. Follow-up documents are limited to 512 KiB. The Worker budgets three redirects, three candidate actions and a single intermediate document level. All inputs, redirects and candidates are untrusted. Returned source evidence is inert text.

## Worker flow and limits

- `POST /api/resolve` accepts a JSON body with one user-supplied URL. It returns a decision, verified candidates and short evidence fields as JSON. `POST /api/scan-download` rechecks a chosen URL before handing its first range to the scanner. POST keeps submitted URLs out of API request paths. Direct links with an archive or Mach-O filename still use the existing browser-first scan and its fallback `GET /api/scan`.
- Discovery runs for at most 5 seconds. The root document is limited to 2 MiB and an intermediate document to 512 KiB. The resolver can follow three candidate or metadata actions total. At most one intermediate document can contribute a new set of candidates. Each HTTP chain can follow three redirects, with four redirects and ten origin transactions in total. DNS checks count toward a separate 24-subrequest discovery cap. The scan uses the existing 20-second deadline and 36-subrequest cap.
- The tokenizer retains up to 64 attributes per element, 8 KiB per attribute, and 96 open elements. It stops at 50,000 tokens and caps a structured script at 512 KiB. All parsing is local. It ignores document-supplied base tags. It rejects XML DTDs and resolves no external entities. Electron YAML uses a reader for scalar `files[].url` fields. The library's top 16 candidates include their score, reasons and evidence.
- Page-derived files must have plausible container MIME and filename evidence and a valid one-byte range. The total declared representation size must fit the configured anonymous cap, which defaults to 8 MiB in this worktree. This deliberately excludes many full Mac installers. The scan repeats the check and the core validates the actual container and Mach-O bytes.
- The original 12-per-minute client limiter and isolate busy lock cover both entry points. Each Cloudflare location allows about 120 requests per minute across the two new routes and 60 upstream requests per minute per target hostname. They fail closed if those bindings are missing. Cloudflare's counters are approximate and local to each location. Set `PAGE_RESOLUTION_DISABLED=true` to disable the two new routes or `SCAN_DISABLED=true` to disable all URL scanning. [Cloudflare rate limiter locality](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/#locality)
- The isolate holds up to 32 parsed public document results for revalidation, keyed by URL and strong ETag. Cache entries require explicit public cache headers and simple variation. The Worker probes files again after a document 304, requests identity encoding and omits cookies, authorization and referrer. An origin asking for backoff is temporarily blocked on that isolate. App Store and access handoffs produce a generic reason.
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

A new failure can use `PAGE_REPLAY_KIT=/path/to/kit scripts/self-heal-pages.sh kit/CASE`. The directory contains `case.json` in the Astra row format and a `snapshots/` directory for the gzipped HTML and optional metadata. Record the submitted URL, final URL, status, MIME type, HTML snapshot path and an expected download with the observed one-byte response. The original 200 corpus rows remain part of the acceptance check.

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

The Chromium tests emulate Windows, Android, iPhone, Safari-style iPadOS and macOS. Android is checked at 320 px. The phase test exercises a delayed page lookup, candidate picker, automatic arm64 selection, scan progress and both kinds of handoff. The existing access checks passed all 18 assertions, and the nine scanner smoke cases passed.

The preview element-count check measured 12, 34 and 45 elements on desktop and 11, 31 and 38 at phone width for idle, mid-scan and done. All six counts fit the original ±10% bands. Actual touch browsers show the three individual Cancel buttons for queued rows, which brings the phone mid-scan count to 34. The controls remain available while the queue runs.

## Offline corpus replay

Run the replay from `scanner/web` after `npm run build`.

```sh
npm run test:pages-corpus
node scripts/replay-pages.mjs --verify --details
```

The replay supplies 195 captured HTML documents and the recorded status or supporting metadata for five rows without root HTML. It uses local body fixtures and recorded redirects. Captured redirect hops to the same artifact count as equivalent links. The Sol sample supplies header verification for most routes, so the selection replay simulates a one-byte response from those observed file headers. The Astra sample requires a recorded one-byte response. Temporary storage redirects are replayed as captured. Unrecorded URLs receive a fixture miss. These results measure selection against the saved observations.

Selection uses the usual path, document, redirect and candidate limits with the artifact size ceiling lifted. A separate pass requires an actual recorded range under the configured 8 MiB representation cap. The baseline tracks each row's decision and SHA-256 of each offered URL. It rejects a wrong automatic selection, an unrecorded choice or a lost under-budget artifact. The target check requires a correct automatic resolution.

| Corpus | Rows | Correct | Wrong | Ambiguous | Unresolved | Gated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sol | 100 | 50 | 0 | 5 | 27 | 18 |
| Astra | 100 | 45 | 0 | 8 | 29 | 18 |
| **Total** | 200 | 95 | 0 | 13 | 56 | 36 |

The generic path found a recorded file on 80 of 200 rows (40%). Adapters added 28 rows (14%). The replay matched 108 of the 134 rows with recorded file evidence, including 13 rows with a valid choice. The remaining 26 positive rows need more fixture evidence, a supported intermediate route or stronger extraction. The static ranker alone placed an unconfirmed link first on 12 positive rows. The transport rejected or bypassed those proposals in replay.

Six cases had a captured one-byte response and passed the default 8 MiB representation cap. The rest include larger files, HEAD-only observations, gates or routes without usable captured transport. SourceForge's Audacity project needs two intermediate document reads in the captured route. The bounded flow allows one. The Sol iTerm2 HTML exceeded the research fixture cap, and the captured appcast served older builds.

### Results by exposure pattern

| Corpus | Exposure pattern | Rows | Correct | Wrong | Ambiguous | Unresolved | Gated |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Astra | `access-wall` | 5 | 0 (0%) | 0 | 0 | 1 | 4 |
| Astra | `bootstrap-installer` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Astra | `client-rendered` | 4 | 0 (0%) | 0 | 0 | 4 | 0 |
| Astra | `download-redirect` | 5 | 4 (80%) | 0 | 0 | 1 | 0 |
| Astra | `embedded-data` | 6 | 4 (67%) | 0 | 2 | 0 | 0 |
| Astra | `file-anchor` | 4 | 4 (100%) | 0 | 0 | 0 | 0 |
| Astra | `file-share` | 6 | 0 (0%) | 0 | 0 | 6 | 0 |
| Astra | `form-or-license` | 8 | 0 (0%) | 0 | 0 | 3 | 5 |
| Astra | `header-sensitive` | 2 | 0 (0%) | 0 | 0 | 2 | 0 |
| Astra | `intermediate-document` | 7 | 4 (57%) | 0 | 0 | 3 | 0 |
| Astra | `localized-entry` | 2 | 1 (50%) | 0 | 0 | 1 | 0 |
| Astra | `managed-distribution` | 5 | 0 (0%) | 0 | 0 | 1 | 4 |
| Astra | `platform-controls` | 10 | 9 (90%) | 0 | 1 | 0 | 0 |
| Astra | `product-suite` | 3 | 0 (0%) | 0 | 3 | 0 | 0 |
| Astra | `release-catalog` | 11 | 9 (82%) | 0 | 2 | 0 | 0 |
| Astra | `script-configuration` | 3 | 2 (67%) | 0 | 0 | 1 | 0 |
| Astra | `source-or-instructions` | 5 | 1 (20%) | 0 | 0 | 4 | 0 |
| Astra | `storefront` | 7 | 0 (0%) | 0 | 0 | 2 | 5 |
| Astra | `update-metadata` | 5 | 5 (100%) | 0 | 0 | 0 | 0 |
| Sol | `access_block` | 2 | 0 (0%) | 0 | 0 | 0 | 2 |
| Sol | `account_gate` | 1 | 0 (0%) | 0 | 0 | 0 | 1 |
| Sol | `aggregator` | 3 | 0 (0%) | 0 | 0 | 3 | 0 |
| Sol | `app_store` | 2 | 0 (0%) | 0 | 0 | 2 | 0 |
| Sol | `architecture_variants` | 3 | 3 (100%) | 0 | 0 | 0 | 0 |
| Sol | `cloud_product_download` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `config_json` | 2 | 0 (0%) | 0 | 0 | 2 | 0 |
| Sol | `electron_feed` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `email_gate` | 2 | 0 (0%) | 0 | 0 | 0 | 2 |
| Sol | `extensionless_redirect` | 3 | 3 (100%) | 0 | 0 | 0 | 0 |
| Sol | `forge_release` | 9 | 4 (44%) | 0 | 0 | 5 | 0 |
| Sol | `form_post` | 2 | 0 (0%) | 0 | 0 | 0 | 2 |
| Sol | `homebrew_cask` | 4 | 4 (100%) | 0 | 0 | 0 | 0 |
| Sol | `html_fragment` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `html_interstitial` | 4 | 1 (25%) | 0 | 0 | 2 | 1 |
| Sol | `iframe_asset` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `installer_stub` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `license_gate` | 2 | 0 (0%) | 0 | 0 | 0 | 2 |
| Sol | `literal_script` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `localized_download` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `meta_refresh` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `mirror_interstitial` | 4 | 1 (25%) | 0 | 2 | 1 | 0 |
| Sol | `package_manager` | 1 | 0 (0%) | 0 | 0 | 1 | 0 |
| Sol | `script_template` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `setapp` | 1 | 0 (0%) | 0 | 0 | 0 | 1 |
| Sol | `shared_file` | 5 | 2 (40%) | 0 | 0 | 0 | 3 |
| Sol | `shell_installer` | 1 | 0 (0%) | 0 | 0 | 1 | 0 |
| Sol | `source_only` | 1 | 0 (0%) | 0 | 0 | 1 | 0 |
| Sol | `sparkle_feed` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `squirrel_feed` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `static_artifact` | 1 | 1 (100%) | 0 | 0 | 0 | 0 |
| Sol | `storefront_gate` | 4 | 0 (0%) | 0 | 0 | 1 | 3 |
| Sol | `structured_inline` | 3 | 3 (100%) | 0 | 0 | 0 | 0 |
| Sol | `suite` | 5 | 2 (40%) | 0 | 3 | 0 | 0 |
| Sol | `testflight` | 1 | 0 (0%) | 0 | 0 | 0 | 1 |
| Sol | `ua_default` | 3 | 1 (33%) | 0 | 0 | 2 | 0 |
| Sol | `universal_build` | 2 | 2 (100%) | 0 | 0 | 0 | 0 |
| Sol | `vendor_api` | 5 | 2 (40%) | 0 | 0 | 3 | 0 |
| Sol | `versioned_endpoint` | 7 | 5 (71%) | 0 | 0 | 2 | 0 |
| Sol | `web_installer` | 1 | 0 (0%) | 0 | 0 | 1 | 0 |

## Verification

- The locked offline Rust workspace suite passed 62 tests. The CLI separately resolved a local HTML fixture and wrote a query-redacted unresolved ledger row.
- The Node suite passed 54 tests, including 15 page Worker tests. The Wasm and static assets built locally.
- All 17 Chromium tests passed on the full rerun, along with the access and scanner smoke checks. The folder-picker test also passed separately after its first suite process exited early.
- Offline replay verified every row against the selection baseline and exercised a new synthetic replay kit. Live provider responses, production Cloudflare routing and native Safari remain unverified.

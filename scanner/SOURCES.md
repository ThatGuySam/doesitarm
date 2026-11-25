# Mac app sources

The `sources` binary discovers public macOS distributions, probes them with HTTP ranges, and passes seekable artifacts to `scan-core`. It records the evidence for every outcome. Failed observations can be replayed live or reduced to an offline fixture for a Rust patch.

## Run

Run these commands from `scanner/`.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
cargo build --locked --offline -j2 -p source-tools --bin sources

OUT="$HOME/Code/doesitarm-data/app-sources/runs/example"
target/debug/sources run --connector github-releases --input repositories.txt --limit 50 --out "$OUT"
target/debug/sources run --connector sparkle-appcasts --input feeds.txt --limit 50 \
  --out "$OUT" --scan-ranges --max-tier 8
target/debug/sources triage --dir "$OUT"
target/debug/sources verify --task "$OUT/agent-tasks/budget_hit.md" --sample 1
```

Input is a text file with one seed per line or JSONL. Blank lines and `#` comments are allowed. JSONL accepts `url`, `name`, `vendor`, `bundle_id`, `version`, `format_guess`, `size`, `etag`, `minimum_system_version`, `build_version`, `platform`, and `direct`. It also accepts the research corpus's `bundle_id_if_known` and `version_if_known`. GitHub seeds can be `OWNER/REPO`, public repository URLs, or release tag URLs. Sparkle seeds can be appcast URLs or public Info.plist files with `SUFeedURL`. A row marked `direct: true` uses an already pinned artifact URL. `--pinned` applies this to the whole file.

The default run validates a one-byte range. A rejected range can fall back to HEAD for reachability and size evidence. `--scan-ranges` allows the useful ranges requested by the existing `remote-cli` profile. Its transfer ladder starts at 8 MiB and escalates only on budget exhaustion, up to 64 and 256 MiB. `--max-tier 8` keeps the pilot on the first step. The scanner keeps no app files and skips streaming fallback for servers that ignore ranges. Error and landing-page evidence may contain up to 512 bytes of text. Failed range scans retain up to 512 bytes of prefix evidence and can use one bounded diagnostic range within the original byte budget. Signed CDN URLs are used in memory and recorded with credential-bearing queries removed.

Each invocation uses at most two concurrent HTTP requests, one per hostname, with at least one second between request starts and a small jitter. The same scheduler covers robots, metadata, redirects, and artifact requests. Retryable failures back off and respect Retry-After and GitHub rate-limit reset times. Long resets return `rate_limited` so the run can finish other work. Each redirect receives its own policy and robots check. The client accepts public HTTP(S) destinations and rejects private DNS addresses, embedded credentials, and HTTPS downgrades. Schedule one live invocation at a time if several runs share a machine.

Use Ctrl-C or SIGTERM for a cooperative stop. Restart with the same input, options, and output directory. `--limit` can grow to continue the same pinned input. Use a fresh run directory to refresh outcomes or change the scan options. Metadata ETags are cached under `$XDG_CACHE_HOME/doesitarm-source-tools` or `~/.cache/doesitarm-source-tools`. `--cache` overrides the location. A public metadata body can serve a subsequent 304 only for its matching URL and ETag.

## Output and architecture

- `crates/source-tools/src/connectors/` contains the public `Connector` interface and small per-source implementations. Discovery streams over seeded repositories, recipes, and feeds. Resolving produces direct artifact URLs while retaining the discovery seed.
- URL normalization strips fragments and known tracking parameters. Deduplication checks normalized URL, then a known bundle ID, then publisher and normalized name. It spans connectors in one run directory. `duplicates.jsonl` preserves the skipped URL, reason, and kept candidate ID. Seed and feed metadata are observations. Artifact architecture and bundle compatibility come from the scanner.
- `src/http.rs` controls network access and response limits. `src/artifact.rs` adapts validated HTTP ranges to `scan_core::ReadAt`. Artifact size, final representation, and strong ETag must stay consistent. The corpus row uses the [Homebrew export schema](../../doesitarm-data/homebrew-scans/README.md) with source, candidate ID, probe, failure class, revision, and timestamp. The primary Mach-O flags can verify a scan even when app-wide inventory is unavailable. In that case bundle-wide ARM compatibility stays unknown.
- `checkpoint.jsonl` is the durable journal. A resume removes a torn final line and retains complete events. `<connector>/results.jsonl`, `duplicates.jsonl`, per-class failure files, and `triage.md` are atomically refreshed from it. The output directory is locked during mutations. The summary distinguishes discovered candidates, duplicate rows, failed discovery, reachable artifacts, scans attempted, verified results, and all failures by class. Its artifact bytes include probes and failed attempts. Discovery and robots bytes have separate counters. Median and p95 use attempted scans.
- Failure evidence includes the original and final URLs, response status, selected headers, bounded text and hex prefixes, and available scanner error and container paths. Saved logs omit authorization headers and signing queries. Access policy can stop a request before the server returns a status.

## Connector coverage

| Connector | Seed and scope | Access |
| --- | --- | --- |
| `github-releases` | Public repository latest stable release or pinned tag. Filters compiled macOS assets by name and extension, ranks universal and Arm assets first, and retains public release metadata. | Uses `GITHUB_TOKEN` if present for authenticated REST metadata. Asset transfers use the public GitHub asset API when discovery returns an ID. Pinned browser URLs still follow their robots rules. Start with curated repository lists and respect per-resource API limits. [GitHub release assets](https://docs.github.com/en/rest/releases/assets) |
| `autopkg` | Public download recipe URLs. Reads literal plist downloader arguments, selected Sparkle/GitHub processors, and simple YAML Input fields. | Static resolution. Parent inheritance and other processors produce a task. Use public recipe repositories and check the publisher origin's rules. [AutoPkg recipe search](https://github.com/autopkg/autopkg/wiki/Searching-for-recipes) |
| `installomator` | Public label fragment URLs. Reads a single literal assignment to `downloadURL`. | Static resolution. Dynamic helpers, conditions with several URLs, and managed app actions require triage. [Installomator](https://github.com/Installomator/Installomator) |
| `sparkle-appcasts` | Public appcasts and Info.plist feed links. Reads full stable enclosures, version, display version, minimum macOS, and declared length. | Skips deltas and preview channels. Feed indexes need a curated seed list. Gated channels require publisher permission. [Sparkle publishing](https://sparkle-project.org/documentation/publishing/) |
| `electron` | Public `latest-mac.yml` and Squirrel JSON URLs. Supports static manifest fields and relative links. | Use publisher feeds and preserve versioned links. Templates, anchors, and executable updater helpers need separate work. [Electron updater guide](https://www.electronjs.org/docs/latest/tutorial/updates) |
| `tauri` | Public updater JSON with Darwin entries or a caller-chosen Darwin endpoint. Resolves public GitHub asset descriptors. | Supply a published channel and platform. Dynamic endpoints or account-scoped updates need separate permission and fixture coverage. [Tauri updater](https://v2.tauri.app/plugin/updater/) |
| `macports` | Port names or URLs of official binary mirror directories. Extracts native Darwin TBZ2 variants, preferring newer Darwin targets and Arm at the same target. | Seed from the public port index, with an Aqua/GUI filter where appropriate. Portfile distfiles and noarch metaports are excluded. [MacPorts binary mirror](https://packages.macports.org/wget/) |
| `nix` | A pinned Darwin cache store hash. Use `aarch64-darwin HASH` or a JSONL cache URL with `platform`. Resolves the public narinfo to a NAR and retains its compressed size. | Generate seeds from a pinned Darwin package index. Core currently reports unsupported NAR and retains that outcome for triage. [Darwin index guidance](https://github.com/nix-community/nix-index-database) |
| `url-list` | A newline-delimited list of public artifact URLs or JSONL. | Use curated publisher links. Inspect the source's access rules before making a campaign. |

Automatic catalog enumeration remains separate from seed-driven discovery. MacPorts needs a port-index export filtered to the desired GUI and CLI cohorts. Nix needs a Darwin package-to-store-output export and a core NAR reader. Publisher directories and third-party taps need reviewed enumeration and static target resolution. The research places itch.io, Steam, GOG, Epic, and App Store downloads in a separate permissioned workflow. Commercial listings and checkout providers are discovery or permission leads. The transport blocks those origins in this scanner. [App-sources ranking and access notes](../../notes-search/docs/research/macho-wasm-scanner-2026-11-23-team/seats/app-sources/notes.md)

### Add a connector

1. Add a module and register its identifier, CLI name, and Rust patch path in `connectors/mod.rs`.
2. Select the authorized public metadata endpoint and describe how seeds are enumerated. Preserve publisher, version, and URL provenance. Use the common transport and its request limits.
3. Parse a small recorded fixture under `crates/source-tools/tests/fixtures/`. Cover a valid record and a withheld, malformed or unsupported record. Use fixture transport for all network-shaped tests.
4. Return a stable failure class with safe evidence. Add a narrowly scoped triage hint when the generic connector or parser hint is insufficient.
5. Run the Rust tests and audit a bounded public cohort where permitted. A valid 206 proves addressability. Verified architecture requires real Mach-O evidence.

## Failures and patch review

HTTP and access classes include `http_<status>`, `rate_limited`, `needs_login`, `post_required`, `redirect_loop`, `invalid_redirect`, `source_policy`, `robots_disallowed`, `robots_unavailable`, `timeout`, and DNS or transport errors. Artifact probe classes include `html_landing_page`, `github_asset_metadata_only`, `no_range_support`, `invalid_range`, and `representation_changed`. Discovery records classes such as `parse_error:<connector>`, `no_mac_assets`, `recipe_requires_resolution`, and metadata size or encoding failures. Scanner classes include `unsupported_container:<kind>`, `unsupported_codec`, `nested_container`, `invalid_container`, `plist_not_found`, `no_macho_found`, `executable_not_found`, `metadata_missing`, `scan_limit`, and `budget_hit`.

`sources triage --dir DIR` writes up to three representative samples per class to `triage.md` and each task file. `sources verify --task TASK --sample N` reruns the saved sample and exits 0 after the required probe or verified scan. It exits 1 when the outcome is still a failure and 2 when the task or command cannot be evaluated. Replays retain the original scan mode and limits. A live publisher can change between replays, so use immutable fixtures for patch promotion.

The default launcher template is `codex --ask-for-approval never exec --ephemeral --sandbox workspace-write - < "$1"`. The healing runner is offline by construction. A hosted Codex login needs its own authorized drafting session. Bring the resulting patch into the runner through a local `AGENT_CMD` that receives the task file as its first argument.

```sh
AGENT_CMD='bash /path/to/offline-agent-wrapper "$1"' \
  HEAL_AGENT_BIN=/path/to/offline-agent-wrapper \
  scripts/self-heal.sh "$OUT" --limit 3 --budget-secs 240
```

Start from a clean worktree and a built `sources` binary. Place a trusted fixture named `<class>.replay.json` beside the task. The fixture can use the following structure.

```json
{
  "responses": [
    {
      "url": "https://publisher.example.org/updater.xml",
      "mode": "metadata",
      "status": 200,
      "headers": {"content-type": "text/xml"},
      "body_text": "<rss>...</rss>"
    }
  ],
  "assets": {
    "https://publisher.example.org/app.zip": {"hex": "00", "etag": "\"fixture\""}
  }
}
```

Use `directory` for a MacPorts mirror index. For a recorded range, use a mode such as `bytes=0-0` and include the returned `content-range`, `content-length`, and `body_hex`. `assets` entries serve arbitrary valid ranges for compact synthetic payloads. Fixtures are capped at 256 KiB. `sources run --fixture PATH` exercises the whole pipeline offline, and `sources verify --fixture PATH --expect-failure` checks that the original class reproduces.

The runner stages the agent's work in a disposable directory inside the worktree. Linux Landlock confines filesystem writes to that directory, and seccomp denies new network sockets, external connections, and privileged or cross-process operations. No credentials or ambient file descriptors are passed in. Build and test execute in a fresh isolated copy with the original task and replay read-only. The runner promotes only allowed Rust and regression fixture paths after `cargo test` and replay pass. It skips tasks that lack a fixture or whose baseline cannot reproduce. It appends accepted, reverted, and skipped outcomes to `DIR/heal-log.jsonl`. A rejected patch never reaches the active worktree. Use `scripts/test-self-heal.sh` to reproduce both outcomes with the local stub.

## November 24 pilot and resume

Both research markers were present when this worktree started from `scanner-wasm` at `5a7e79a`. The checkout contains [MERGE.md](MERGE.md) and [CLIMB.md](CLIMB.md). `EDGE.md` was absent.

The initial pilot used 55 GitHub candidates and 60 Sparkle discovery events at 8 MiB. It wrote results and generated tasks under `~/Code/doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/`. GitHub's browser download paths were disallowed by robots. Sparkle verified 29 of 39 scans, with 20 feed discovery failures. The retained observations are the baseline for a follow-up on GitHub's documented asset API and two feed-response fixes.

### Follow-up commands

The follow-up uses the public asset API for the first 22 GitHub release tags and keeps pinned browser URLs for the rest of its comparison cohort. Sparkle uses the full 74-seed list. Run these commands from `scanner/`.

```sh
BASE="$HOME/Code/doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot"
OUT="$BASE/follow-up"
target/debug/sources run --connector github-releases --input "$OUT/github-input.jsonl" \
  --limit 60 --out "$OUT" --scan-ranges --max-tier 8 --timeout-secs 100
target/debug/sources run --connector sparkle-appcasts --input "$BASE/sparkle-input.jsonl" \
  --limit 74 --out "$OUT" --scan-ranges --max-tier 8 --timeout-secs 95
target/debug/sources triage --dir "$OUT"
```

### Follow-up results

Scanner revision `410328a` ran both cohorts at the 8 MiB tier.

| Connector | Input events | Discovered | Duplicates | Discovery failures | Reachable | Scanned | Verified | All failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| GitHub Releases | 60 | 60 | 6 | 0 | 22 | 22 | 20 | 34 |
| Sparkle | 74 | 52 | 0 | 22 | 49 | 49 | 34 | 40 |

GitHub consumed 25,452,562 artifact bytes with a median of 738,035 and p95 of 1,846,946 bytes per attempted scan. Sparkle consumed 168,739,677 artifact bytes with a median of 2,013,594 and p95 of 8,388,608. See each connector's summary for additional discovery requests and robots traffic. [GitHub summary](../../doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/follow-up/github-releases/summary.json) · [Sparkle summary](../../doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/follow-up/sparkle-appcasts/summary.json)

| Failure class | Count | First investigation |
| --- | ---: | --- |
| `robots_disallowed` | 56 | Match pinned GitHub releases to their documented API asset IDs. Preserve exclusions at other publisher origins. |
| `budget_hit` | 12 | Start with MPP Viewer and compare indexed PKG before and after the 8 MiB boundary. Use the repaired Sparkle feeds as additional cases. |
| `invalid_container` | 3 | Reduce the XZ stream failures for ImageOptim and LaunchControl, and the ZIP central-directory entry for Jumper. |
| `plist_not_found` | 1 | Inspect anypoach's archive layout and see whether the publisher declares a standalone executable. |
| `metadata_missing` | 1 | Identify the missing field in LaTeXiT and check the bundle or Mach-O deployment metadata. |
| `robots_unavailable` | 1 | Recheck the failed Sourcetree robots request with the established backoff. |

The follow-up triage includes sample commands and evidence. [Triage](../../doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/follow-up/triage.md)

The workspace passed 58 Rust tests, formatting, and Clippy with warnings denied. The offline stub discarded a bad patch after its replay failed and kept a good patch after tests and replay passed. It also checked that an outside write, an outside permission change, and network socket creation were blocked. [Stub log](../../doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/follow-up/self-heal-stub.txt)

A two-feed recheck on `b1692ac` reached both artifacts and exercised the 8 and 64 MiB attempts. BetterTouchTool reached partial Intel evidence before a response-body transport error. BrowserStack Local reached a declared executable lookup in its tarball and reported `no_macho_found`. Both have separate tasks in the recheck directory. The retained pilot outputs total about 1.27 MB and include only text records and lock files. [64 MiB recheck](../../doesitarm-data/app-sources/runs/2026-11-24-source-tools-pilot/follow-up/feed-recheck-64/triage.md)

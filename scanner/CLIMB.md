# Homebrew scanner climb

Started November 24, 2026 at 00:57 Central. Deadline 02:47 Central. Local branch `scanner-climb`.

## Scoreboard

| Run | Regression verified | Held-out verified | Notes |
| --- | ---: | ---: | --- |
| Original handoff, 8 MiB | 21/30 | — | ZIP 6/9, DMG 10/11, tar.gz 4/5, PKG 1/5 |
| Fixed cohorts, unchanged scanner at 8 MiB | 54/100 | 42/100 | 96 and 94 origins respectively |
| HTTP stream fallback and 8 → 64 → 256 MiB | 74/100 | 56/100 | Original 30 reached 28/30. Warp returned 404. Mullvad reached the attempt timeout. |
| BOM, codecs, declared targets and nested packages | 77 apps + 8 executables | 65 apps + 8 executables | Original 30 reached 29/30. Warp still returned HTTP 404. |

[Regression baseline](results/climb/baseline-regression/scoreboard.md) · [Held-out baseline](results/climb/baseline-held-out/scoreboard.md) · [Transport regression](results/climb/transport-regression/scoreboard.md) · [Transport held-out](results/climb/transport-held-out/scoreboard.md) · [Final regression](results/climb/final-regression/scoreboard.md) · [Final held-out](results/climb/final-held-out/scoreboard.md)

The two fixed sets use the 7,851-cask catalog pinned by the original benchmark. The regression cohort adds 70 casks selected by container with a preference for distinct origins. The held-out set contains a disjoint 100 and is used only for aggregate measurement. Both cohorts gained 23 fully verified apps and eight standalone results from baseline to final. The regression manifest now records reference evidence for 86 entries that verified during at least one reproducible run.

## Failure taxonomy

| Outcome | Baseline regression | Baseline held-out | Transport regression | Final regression |
| --- | ---: | ---: | ---: | ---: |
| Budget hit | 26 | 31 | 2 | 4 |
| HTTP 200 to Range | 6 | 2 | 0 | 0 |
| Unsupported container | 6 | 12 | 6 | 1 |
| App plist unavailable | 5 | 10 | 13 | 1 |
| HTTP 404 / 403 | 1 / 0 | 0 / 1 | 1 / 0 | 1 / 0 |
| Other source error | 1 | 0 | 1 | 2 |
| Timeout | 0 | 0 | 1 | 0 |
| HTML response | 0 | 0 | 1 | 1 |
| Metadata missing | 0 | 1 | 0 | 0 |
| Other parser error | 1 | 1 | 1 | 1 |

Additional final regression outcomes were two script executables, one declared executable missing from a complete tar traversal, and one archive with multiple registered executables including a script. The architecture hints yielded 34 agreements and seven unavailable comparisons. Against the baseline, 48 verified, one-attempt results had matching strong ETags and a net increase of six bytes. Their metadata agreed. [Regression byte and metadata comparison](results/climb/final-regression/baseline-delta.json)

The full manifest pins 7,570 HTTP(S) artifacts across 5,138 casks from a fresh 7,851-cask Homebrew catalog. It includes distinct macOS platform and language URLs and preserves disabled entries with direct URLs. Three catalog variants declare a POST body. GrADS declares FTP. The manifest records those exclusions. Per-artifact JSON includes the CLI evidence and architecture comparisons. [Full manifest](results/climb/full-run/manifest.json.gz)

A verified app has a bundle identifier, bundle version, minimum macOS, and verified Mach-O slice headers for the declared executable. A verified standalone executable has verified slice headers and a macOS deployment target. The pinned catalog version and observed bundle version are separate fields. The scoreboard groups by detected format when available and uses the catalog or filename to label earlier failures. Budget hits, timeouts, and parser limits remain open.

## Changes and evidence

- Range discovery and fallback preserve the byte cap. Stream fallback uses an anonymous spool and closes it after the scan. Kunkun verified from a single 327,680-byte response.
- Zoom now verifies at the first 8 MiB tier using 965,581 bytes (0.444% of the package) across 12 reads. The 256 MiB transport attempt used 216,557,507 bytes on the same ETag. The first live pilot exposed a 2.7 MB BOM whose final leaf is reached by the sibling link. The corrected fixture covers that leaf layout, compares two DEFLATE histories, checks the CPIO trailer, and rejects a changed plist. [Zoom evidence](results/climb/zoom-fixed/run.json)
- The first bzip2/XZ pass misclassified six pinned DMGs that began with a compressed UDIF chunk. The revised detector checks the UDIF trailer before these codec signatures. The new DMG fixture reproduces the collision.
- The final cohort run includes plain, bzip2 and XZ tar, bzip2 and LZMA ZIP members, explicit bundle and standalone binary paths, nested flat PKGs, legacy package payloads and disk images inside ZIP. Mailplane went from unsupported TBZ to a verified app after 72,550,368 bytes. Devin CLI verified its named standalone binary at 65,541 bytes. FabFilter Pro-DS now reaches its nested installer PKG, where it exhausted the first tier. The catalog policy also escalates nested PKGs. [Regression evidence](results/climb/final-regression/run.json)
- Verification passed 31 Rust tests, Clippy with warnings denied, 144 native/Wasm comparisons plus callback errors, and six Python runner tests.

## Remaining regression cases

| Evidence | Follow-up |
| --- | --- |
| Soothe2, Aqua Data Studio, and Insta360 Link Controller reached 256 MiB before the declared app could be verified. | Find package or codec indexes before raising the cap. Query BOMs for a component with the target path and use independently sized blocks where possible. |
| FabFilter Pro-DS exposes a 16.9 MB DMG with a nested PKG. The fixed regression budget ended inside it. | Recheck under the catalog's nested installer escalation policy. |
| Qt Design Studio's 427.2 MB artifact is cataloged as 7z. The initial probe returned an unrecognized format. BackupLoupe reached an XZ decoder error after 66,055 bytes. | Add 7z header and solid-stream support. Capture the XZ filter and dictionary properties before choosing a decoder change. |
| Cursor CLI and Suunto DM5 declare launch scripts. Flutter's targets include a script. BrowserStack Local's declared executable path was absent from the tar walk. | Use static inspection to resolve archive links and explicit script targets. |
| Segger J-Link returned 27,647 bytes of HTML. Its catalog declares a POST body for the download. Two other origins reported HTTP 500 or a global request timeout. | Treat the HTML and transport responses as observations. Recheck transient sources separately. |
| Warp returned HTTP 404 on its pinned URL. Anka Build Cloud Registry's CPIO traversal found no app plist. | Preserve the pinned error evidence. Scan any differently declared artifact as a new representation. |

## Full run at the deadline

The catalog campaign paused at 02:44 Central with **676/7,570 artifacts checked**. It verified **517 apps and 12 standalone executables**. The scoreboard records an outcome and evidence for each of the other 147 checked artifacts. Another **6,894 artifacts remain pending**. [Catalog scoreboard](results/climb/full-run/scoreboard.md) · [Per-artifact results](results/climb/full-run/run.json)

The checked artifacts cover 587/5,138 distinct casks. All pinned variants were checked for 364 casks and verified for 300. Across all completed attempts, the CLI reported 10,538,618,364 bytes and 11,560 reads. 3 attempts ended without byte counts.

| Container | Checked | Apps verified | Executables verified | Other outcomes |
| --- | ---: | ---: | ---: | ---: |
| dmg | 423 | 333 | 1 | 89 |
| macho | 4 | 0 | 4 | 0 |
| pkg | 60 | 36 | 0 | 24 |
| tar.bz2 | 3 | 2 | 1 | 0 |
| tar.gz | 12 | 3 | 4 | 5 |
| tar.xz | 4 | 2 | 0 | 2 |
| tar.zst | 1 | 0 | 0 | 1 |
| unknown | 4 | 0 | 0 | 4 |
| zip | 165 | 141 | 2 | 22 |

| Unresolved outcome | Artifacts | Distinct casks |
| --- | ---: | ---: |
| other | 47 | 8 |
| plist_not_found | 24 | 23 |
| nested_container | 12 | 12 |
| other_source_error | 12 | 12 |
| metadata_missing | 11 | 11 |
| script_executable | 10 | 9 |
| budget_hit | 7 | 7 |
| http_403 | 4 | 4 |
| http_404 | 4 | 4 |
| unsupported_container | 4 | 4 |
| timeout | 3 | 3 |
| executable_not_found | 2 | 2 |
| host_200_to_range | 2 | 2 |
| html_response | 2 | 2 |
| http_429 | 1 | 1 |
| multi_executable | 1 | 1 |
| unsupported_codec | 1 | 1 |

Architecture hints produced **360 agreements and 0 disagreements**. Another 118 were unavailable and 7 inconclusive. The scoreboard lists any disagreement with its expected and observed architectures. [Architecture hints and disagreements](results/climb/full-run/scoreboard.md#architecture-hints)

The HFS catalog path error accounts for 42 artifacts across 3 casks. Many are language variants of the two LibreOffice language-pack casks. Use the declared nested path and inspect the actual registered artifact before expanding the HFS search.

- **Embedded installers.** Elecom Mouse Utility and TAL-Drum exceeded the 32 MiB expanded limit for compressed members inside ZIP. A bounded seekable reader for inner images and packages would allow further inspection. Chef Workstation, Zulu, Vagrant, and other installers reached a package with no found app plist. Compare install locations and package declarations to the files present in each component.
- **Range consistency.** Baretorrent and WordPress.com Studio accepted the first range and returned HTTP 200 on a later range. Future fallback can restart against one bounded stream and account for earlier bytes before accepting metadata.
- **Slow and unsupported containers.** Use codec or package indexes before raising the transfer cap. Parse XZ filter and dictionary properties for invalid-stream cases. The pinned manifest includes two 7z artifacts and one tar.zst artifact.

The next pending manifest entry is **677**, `synology-surveillance-station-client`.

The first full-run launch produced 248 local CLI argument rejections and zero HTTP requests. The launch diagnostics are archived separately. The runner now aborts on rejected CLI options. [Launch diagnostics](results/climb/full-launch-error/README.md)

## Resume the catalog run

From `scanner/`, run another batch against the same pinned manifest and CLI.

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
python3 scripts/climb.py run results/climb/full-run/manifest.json.gz results/climb/full-run \
  --cli target/scan-cli-campaign --cli-option=--allow-stream \
  --cli-option=--allow-http --cli-option=--request-delay-ms --cli-option=75 \
  --escalate 67108864 --escalate 268435456 --timeout 45 \
  --use-cask-targets --limit 250
```

The retained campaign CLI uses scanner sources at `ce2f329` and has SHA-256 `15d61d5ce4534ecf7265a1a1188cf1118f5d42fe9f0f612fe65700a5631c5fee`. The runner compares the manifest and CLI SHA-256 and the scan policy before appending. Each completed artifact is appended and synced to `checkpoint.ndjson`. The `run.json` report includes the parser output, all attempts, and architecture hint comparisons. The optional `--stop-at` argument accepts a Unix deadline and leaves an interrupted artifact pending.

The campaign runs one scan process at a time. It requests absolute ranges first. The 8 MiB tier can escalate to 64 MiB and 256 MiB for sequential formats or an HTTP 200 stream. The generic user agent and request delay apply to the catalog pass.

# Scanner edge cases

Started November 24, 2026 at 12:04 Central from scanner-wasm `5a7e79a`. Stop by 13:54 Central. Worktree is `~/Code/doesitarm-scanner-edge`.

## Baseline

| Pinned cohort | Apps verified | Standalone executables verified |
| --- | ---: | ---: |
| Regression | 77/100 | 8/100 |
| Held-out | 65/100 | 8/100 |
| Catalog checkpoint | 517/676 | 12/676 |

[Prior campaign](CLIMB.md) · [Merge and first-tier replay](MERGE.md)

## Live replay

| Pinned cohort | Checked | Apps before → after | Standalone executables before → after | Installed products before → after |
| --- | ---: | ---: | ---: | ---: |
| [Regression](results/edge/regression/scoreboard.md) | 100/100 | 77 → 81 | 8 → 8 | 0 → 1 |
| [Held-out](results/edge/held-out/scoreboard.md) | 100/100 | 65 → 71 | 8 → 7 | 0 → 2 |
| Earlier failures | 125/142 | 0 → 15 | 0 → 0 | 0 → 1 |

The regression replay recovered BrowserStack Local, Network Weather, Qt Design Studio, and BackupLoupe as apps. It verified the FabFilter Pro-DS AAX product. All 85 previously verified primary results remained verified. The 84 bundle inventories included two complete inventories and 82 partial ones, with ten inventories identifying at least one x86_64-only file. The transport used 3,531,500,436 read bytes and 6,237 requests across all attempts. [Raw scan facts](results/edge/regression/run.json)

The held-out replay recovered LaunchControl, Prolific PL2303Serial, Ammonite, MailMate beta, tiptoi Manager, Cave Story, and ImageOptim as apps. The scanner verified the FabFilter Timeless AAX product and Amazon Corretto 17's JDK bundle. `btp` returned HTML. Jabra Direct's nested installer reached the scan deadline. Its previous verified result was `Jabra Avaya Integration.app`, an embedded helper. The 75 inventories included seven complete and 68 partial, with six identifying an x86_64-only file. Both 100-artifact cohorts used `11a817b` with the 8/64/256 MiB ladder and a 55-second cooperative per-attempt deadline. [Raw scan facts](results/edge/held-out/run.json)

The additional pinned replay verified 15 app primaries, including the packaged Steam bootstrapper, and the Tal Drum installed product. All 125 completed observations are in the two groups below. Their distinct deadlines and CLI hashes are in the reports. [First 41](results/edge/previously-failing/scoreboard.md) · [Tail replay](results/edge/previously-failing-tail/scoreboard.md)

## Resume

Use one Cargo build at a time with `-j2`. Keep downloads under `~/.cache/doesitarm-edge/` and delete each artifact after inspection. The pinned URLs, formats, outcomes and target declarations are in `results/climb/{final-regression,final-held-out,full-run}/run.json`. Current evidence and next steps will be added here as cases are investigated.

## Remaining cases

- The latest RStudio attempt still reports `unsupported: APFS decmpfs-compressed file`. It identifies the `RStudio.app` bundle before it reaches the compressed executable.
- Warp's pinned artifact returned HTTP 404. The SEGGER J-Link origin returned HTML and its declared POST carries license and export-control attestations. The held-out `btp` attempt returned HTML.
- Open package and app scan limits appear in each scoreboard. The remote byte and time profiles can finish with a primary result and a partial inventory, or stop before the primary. On source failures, the logs retain the actual status and transfer evidence.
- LibreOffice language packs package a shell launcher and language resources. The HFS path fix locates the declared launcher and leaves its Mach-O slices empty. Package and launcher entries without a verified Mach-O retain their own status.

## Confirmed packaging evidence

| Case | Observation |
| --- | --- |
| BackupLoupe, LaunchControl, Ammonite, ImageOptim | Each XZ file advertises a 64 MiB LZMA2 dictionary and CRC64. `xz -lvv` reports 65 MiB decoder memory. The earlier 32 MiB ceiling produced a generic XZ error. |
| BrowserStack Local 3.7.8 | The plist declares `MacOS/BrowserStackLocal.app`. The payload contains a regular, thin x86_64 Mach-O at `BrowserStackLocal.app/Contents/MacOS/BrowserStackLocal.app`. |
| MailMate beta 6272 | The 16,841,015-byte `.tbz` contains 46 concatenated bzip2 streams. The first ends after 174,234 compressed bytes and produces 900,000 bytes. The fat main is in the tar. |
| Qt Design Studio 4.8.3 | The 427,201,220-byte repository component uses one solid LZMA block with an 8 MiB dictionary. The app plist is 6,935 bytes and its named Mach-O is 425,152 bytes. |
| tiptoi Manager 5.3 | `internal.pkg/PackageInfo` declares `/Applications/tiptoi® Manager.app`. The CPIO stores `./Contents/Info.plist` and `./Contents/MacOS/tiptoi® Manager`. |
| Prolific PL2303 | The 566,766-byte `.7z` wraps a 574,186-byte driver PKG. The held-out replay verified `Applications/PL2303Serial.app` and retained the driver installer metadata. |
| CodeQL 2.27.5 | The 879,050,849-byte artifact is an ordinary Zstandard frame with a 128 MiB window and a frame checksum. `codeql/codeql` begins with a shell shebang. |
| Anka Registry 1.52.1 | The XAR’s CPIO has 24 entries and includes scripts under `usr/local/bin`. No app plist was present in the payload listing. |
| Soothe2 1.3.3 | The package carries VST, VST3, AU, and AAX bundles in separate package components. The VST3 main is 68,612,416 bytes and precedes the 1,388-byte plug-in plist. |
| Insta360 Link Controller 2.2.5 build 25 | The 772,108,405-byte CPIO payload includes a 417,541,840-byte `Webcam-desktop` Mach-O before the 3,319-byte outer app plist. The original scanner completed this file using a full local source. |
| Warp | The pinned URL returned HTTP 404 on the original scan and on direct recheck. |
| Network Weather 1.3.3.119 | The baseline failed on an HTTP 500 range response. The regression replay verified the app under the same strong ETag. This is a successful retry of the pinned representation. |
| Ableton Live Standard 12.4.16 | The bounded tail replay verified a universal `Contents/MacOS/Live` from the 3,469,442,643-byte DMG using 3,955,471 source bytes. Its optional inventory is partial. |
| SEGGER J-Link 9.96a | A direct GET returned 27,647 bytes of HTML. The pinned Homebrew POST body explicitly submits `accept_license_agreement=accepted` and `non_emb_ctr=confirmed`. This run used the public GET and left those attestations unsent. |

Apple describes the app bundle's main executable and private code directories. Qt documents `archivegen` as its SDK repository packaging tool. The Zstandard format specifies the decoder window and frame checksum.

[Apple bundle structure](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/BundleTypes/BundleTypes.html) · [Apple nested code locations](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html) · [Qt Installer Framework tools](https://doc.qt.io/qtinstallerframework/ifw-tools.html#archivegen) · [Zstandard format](https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md)

7-Zip documents solid compression as a format feature. That makes the Qt member's preceding decoded bytes part of its read cost even when the member itself is small. Prezi's separate updater bundle fits Sparkle's documented separation of updater, installer and downloader code. Electron documents packaging a renderer and runtime with the application, as seen in Terminal Browser's nested Electron app. OpenJDK's runtime image layout explains the executable and library paths found in the Android Studio distributions.

[7z format](https://www.7-zip.org/7z.html) · [Sparkle sandboxing](https://sparkle-project.org/documentation/sandboxing/) · [Electron distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution) · [OpenJDK runtime images](https://openjdk.org/jeps/220)

## Android Studio verification

Full local scans of the two pinned 2026.2.2.10 HFS+/LZFSE disk images each inventoried 70 Mach-O files. Both `Contents/MacOS/studio` launchers have verified x86_64 and arm64 slices. In the 1,542,370,765-byte Intel artifact, `Contents/jbr/Contents/Home/bin/java` and `lib/server/libjvm.dylib` are x86_64-only, and the bundle-wide result is false. For the 1,524,965,117-byte Arm artifact, all 70 inventoried binaries have Arm slices. These are static binary observations.

[Intel DMG](https://edgedl.me.gvt1.com/android/studio/install/2026.2.2.10/android-studio-rabbit2-patch2-mac.dmg) · [Arm DMG](https://edgedl.me.gvt1.com/android/studio/install/2026.2.2.10/android-studio-rabbit2-patch2-mac_arm.dmg) · [Intel inspection](results/edge/android-studio/intel.json) · [Arm inspection](results/edge/android-studio/arm64.json) · [Generated reproduction](fixtures/edge/android-studio/)

## Reproduction workflow

Use `python3 fixtures/edge/check.py --cli target/release/scan-cli --baseline ../../doesitarm-scanner/scanner/target/release/scan-cli` to verify the generated cases against the new and pre-edge CLIs. The fixture archives contain synthetic headers and small stubs. Keep real inspection output under `target/edge/inspection/` and campaign output under `target/edge/`.

The campaign's manifests reuse the ordered entries and pinned target declarations from the two final CLIMB results. `target/edge/previously-failing.json` contains the 142 failed checkpoint artifacts whose exact token, version, and URL are absent from those cohorts. Use the original 8/64/256 MiB ladder and preserve the measured outcome for every retained target.

Rebuild the pinned manifests with `python3 scripts/edge-cohorts.py target/edge`. To resume a campaign use the same release binary and the `metadata.json` policy in that campaign's directory. `target/edge/run-campaign.sh` completed the two fixed cohorts. The first 41 of the remaining 142 artifacts used `8e805c0` with the same 8/64/256 MiB ladder and a 28-second cooperative per-attempt deadline. The remaining manifest skips those 41 exact identities. It uses `b8572dc` with a single 256 MiB allowance and a 16-second cooperative deadline for broader coverage within the time limit. Preserve the two reports' separate provenance. [First 41](results/edge/previously-failing/run.json) · [Remaining manifest](results/edge/previously-failing-tail/manifest.json)

The tail replay takes new work until 13:44:45 Central, followed by full local verification of selected packages. To resume the tail checkpoint, use the frozen binary and the options below. The original run also set an absolute `--stop-at` deadline.

```sh
python3 scripts/climb.py run results/edge/previously-failing-tail/manifest.json target/edge/previously-failing-tail \
  --cli target/edge/scan-cli-final --budget 268435456 --cli-option=--allow-stream \
  --cli-option=--allow-http --cli-option=--deadline-ms --cli-option=16000 --timeout 19 --use-cask-targets
```

The canonical export was initialized from the three recorded CLIMB reports. It contains 762 cask versions, 33 with multiple retained URLs. A new scan for the same URL, token, and version replaces that representation after publication.

## Verified code checkpoints

- `139a852` adds archive and directory inventories, bounded decoders and readers, package install-location handling, static launcher references, transport restart, and generated cases. The 41 Rust tests passed. All 21 generated edge checks passed with the release CLI and failed with the pre-edge CLI. The largest fixture was 151,552 bytes.
- `f18f984` adds the browser disclosure, folder handling, and the cask export. Six Python runner tests passed, and the JavaScript modules parsed in Node.
- The initial seven-artifact pilot used CLI SHA-256 `c565059a8658421d895a99cdcf9e9740e10cd6aeab04b6284cb203da12998fb6`.

The bzip2 manual confirms that concatenated streams are valid, and the XZ manual describes how larger dictionaries increase decode memory. A Homebrew publisher can package a lightweight launcher separately from its runtime, as illustrated by DigiDNA's WebStorm report. The HN discussion describes the throughput motive for multicore bzip2 tools. MailMate's producer was identified only by its file structure.

[bzip2 manual](https://sourceware.org/bzip2/manual/manual.html) · [XZ manual](https://tukaani.org/xz/man/xz.1.html) · [GitHub launcher report](https://github.com/DigiDNA/Silicon/issues/14#issuecomment-831146342) · [HN multicore bzip2 discussion](https://news.ycombinator.com/item?id=6973699) · [Apple installer Distribution format](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html)

- `369d282` adds a generated APFS descriptor ring above the old limit and a Wine XZ case. Both passed with the release scanner and failed on the pre-edge scanner. The fixture count is now 23.
- The browser and Worker Wasm builds passed 208 native/Wasm JSON comparisons and 14 Node Worker tests. Folder and archive roles are exercised through the common scanner. The no-browser constraint left interactive browser execution out of this pass.

## Direct inspections before the replay

Recorded all 184 distinct pinned failures in [inspection.jsonl](results/edge/inspection.jsonl). Of those, 152 yielded complete HTTP bodies, 30 had incomplete or unavailable transfers, and two exceeded the full-download size ceiling. The complete-body count includes HTML, whose content is recorded separately. Each transfer used a temporary directory under the edge cache. The log preserves sizes, paths, package metadata and download outcomes.

| Artifact | Local observation |
| --- | --- |
| Qt Design Studio | Verified arm64 main and completed the 652-binary inventory from the solid LZMA archive. |
| Insta360 Link Controller | Verified x86_64 and arm64 for the named main and completed the 133-binary inventory. |
| Aqua Data Studio | Verified x86_64 and i386 for the named main and completed the 81-binary inventory. |
| FabFilter Pro-DS and Timeless | Found the AAX product named by the nested PKG's PackageInfo. The product executables verified, and the result labels them as plug-ins. |
| Cave Story | Verified `Doukutsu.app` in the HFSX partition of the raw GPT image. |
| Empoche and Gingko | The ZIP directory ends exactly at the end record. Empoche has 80,296 bytes after that record and Gingko has 112,332. |
| Hydrus Network | `CFBundleExecutable` says `MacOS/hydrus_client`. The thin Intel Mach-O is at `Contents/MacOS/hydrus_client`. |
| LibreOffice language packs | The Dutch HFS disk image contains a 1,170-byte `Contents/LibreOffice Language Pack`, a separate AppleScript resource, and `Resources/tarball.tar.bz2`. The canonical `Contents/MacOS/…` lookup finds no executable. |
| Steam | The `SteamMacBootstrapper.tar.gz` ZIP member includes `Steam.app/Contents/Info.plist` and an 8,702,688-byte `steam_osx`. The ZIP's directory and local-header offsets include the 20-byte wrapper. The first build's relative-offset parser failed on this actual representation. |
| Prezi Video | The ZIP contains `Prezi_Video.pkg`. The original local fallback could choose the Sparkle updater beneath an unmounted `Contents/` tree. The primary scanner now rejects that helper as an outer app. |

The seven-artifact pilot used the original optional inventory allowance. Its Codex result took 35.35 seconds and 995 reads. MacWhisper's successful attempt took 39.11 seconds and 1,160 reads. The follow-up uses smaller optional entry caps and cooperative per-attempt CLI deadlines. The full cohort comparison will use the follow-up release.

The replay release is `11a817b` with CLI SHA-256 `a01be60eb8c0fd14bde36e0056995973b0eda0a745051c9e7fe113e8071e28f6`. It added bounded recovery of ZIP directories followed by trailers, Contents-relative ZIP paths, and in-bundle ZIP symlinks. All 27 fixture checks passed at this checkpoint. The regression replay began at 13:03 Central.

The later package investigation found `application/x-bzip2` on Prezi's XAR `PackageInfo`. The metadata declares `/Applications/Prezi Video.app`, and the CPIO contains `./Contents/MacOS/Prezi Video` and `./Contents/Info.plist`. The final follow-up decodes that metadata, handles Steam's absolute ZIP offsets, and identifies the legacy LibreOffice launcher. These fixes have a separate scanner build and targeted verification.

`8e805c0` contains the follow-up parser changes. The release CLI SHA-256 is `73a24a511353b512266d63345640a200c004bdf0a2490a40edab7055ba6113b7`. Its 30 generated fixtures passed against the release CLI and failed on the pre-edge CLI. The pinned remote replay continues with `11a817b` so one binary and one protocol cover the fixed cohorts.

The Homebrew UI sample comes from the first 30 pinned rows of the regression replay. The web build serves those recorded inventories in the expandable table. [Sample data](results/homebrew-edge-sample.json)

The `8e805c0` build passed 41 Rust tests, Clippy with warnings denied on both native and Wasm targets, 222 native/Wasm comparisons, and 14 Node Worker tests. The web build's cask table asset matches the recorded inventory sample. Its native folder controls were checked in Node with a universal launcher and an Intel-only runtime.

The live Corretto result prompted a follow-up for `.jdk` bundles, whose `Contents/Home` directory holds the runtime. The old inventory reported itself complete after reading only the declared `libjli.dylib`. `b8572dc` adds that runtime path, and the generated Corretto fixture fails on `8e805c0` and passes on `b8572dc`. This latest CLI has SHA-256 `bc9aae18c3c66c745ea6eb417322ff926c8611a916372b9728c4001bda3c0501`. The 31 fixture directories cover 29 of the 141 distinct failure tokens, including 69 of the 184 pinned representations. Android Studio is a separate inventory case and the ZIP-link fixture exercises a shared parser case. Origin failures and unresolved layouts still lack a per-app red/green fixture.

On `b8572dc`, all 31 generated checks passed with the release CLI and failed against the pre-edge CLI. The largest generated file was 151,552 bytes. All 41 Rust tests, native and Wasm Clippy checks, 222 native/Wasm parity comparisons, and 14 Worker tests passed. The Wasm role API also classified `Contents/Home/lib/server/libjvm.dylib` as runtime code. The web distribution's cask data asset matched the committed sample.

## Final native local checks

The complete, checksum-matching Steam archive verified the universal bootstrapper and a six-binary inventory. The nested archive explicitly identifies itself as `SteamMacBootstrapper.tar.gz`. The cask export retains those slices and reports its scope as `bootstrapper`, with unknown Apple Silicon compatibility for the installed client.

The complete, checksum-matching Prezi archive verified `Applications/Prezi Video.app/Contents/MacOS/Prezi Video` as universal and completed a 40-binary inventory. The Cursor and Terminal Browser archives each verified the ARM64 runtime referenced by the packaged shell launcher. The primary launcher status is a script in both cases. The two downloaded LibreOffice language packs resolved their named legacy launchers and had empty Mach-O inventories.

Reddit, Stack Exchange, and the Wayback Machine were unavailable from this machine. Research used Apple documentation, upstream project sources, GitHub issues, the Hacker News Algolia API, and direct publisher responses.

# Scanner fixes, round two

Base `scanner-pages` at `12b3b2c`. The three review branches remain independent. Historical numbers come from the indicated ledger attempts or the companion reports. Current scanner byte counts use `bytes_read` (unique source bytes). Transfer body counts and parser requests are called out separately. A local-file scan with `--profile remote-cli` tests the parser budget independently of origin throughput.

## Sequential gzip

[Gzip's member format](https://www.rfc-editor.org/rfc/rfc1952) allows concatenation and has no member directory. A known independent member can restart inflation. Each checksum-matching Aqua and Insta360 stream contains one member. A gzip trailer gives the CRC and decoded size modulo 2³². It supplies no member or file offsets. Tar has record headers inline, while Insta360's XAR and BOM identify the payload and installed paths without providing the prior DEFLATE window.

[zlib's indexed reader](https://github.com/madler/zlib/blob/develop/examples/zran.c) creates checkpoints by traversing the stream, retaining the compressed bit position and previous 32 KiB of decoded history. [zlib-rs full flush](https://github.com/trifectatechfoundation/zlib-rs/blob/main/zlib-rs/src/deflate.rs) resets history when the compressor emits it. The scanner cannot insert that reset into a published stream, and finding a stored-block marker alone does not establish a restart. An artifact-bound index provided by the publisher could amortize full reads across scans. The current capped profile still applies to unindexed streams.

The existing gzip-tail recovery can read a late PKG plist when the suffix decodes independently and the CPIO record matches the BOM. The recorded Insta360 measurement found 1,104 plist bytes dependent on the missing history at the final block boundary and 370 at an earlier boundary. Aqua's required slice headers start more than 7 MiB from the compressed end. It is a tar file with no independently authenticated entry offsets. See [the container inspection](FIX-CONTAINERS.md#insta360s-unindexed-gzip-payload). The offline test `tar_reports_budget_exhaustion_if_compressed_prefix_is_too_short` covers an under-budget prefix without network access.

| Artifact | Ledger attempt at 256 MiB | Bytes read before | Exact sequential prefix measured outside the scanner | Case evidence |
| --- | --- | ---: | ---: | --- |
| Aqua Data Studio 26.1.0 | `c8b419addd49` | 268,435,451 | 828,557,894 | The prefix reaches the complete i386 header at decoded byte 1,035,138,588. The bundle plist is at 29,696. |
| Insta360 Link Controller 2.2.5 build 25 | `1979b4c560ba` | 268,173,301 | 772,108,335 | The count covers the compressed XAR Payload up to the end of the outer CPIO plist. This omits the separately read XAR index and metadata. The earlier launcher headers alone do not establish the declared app. |
| Papyrus 2024-06 6.7.0 | `cf055d27515a` | 268,435,451 | 716,043,933 | The package puts the 1,749-byte plist at decoded byte 823,188,992 after the launcher. |
| openFrameworks 0.12.1 | `aa436d6c069b` | 268,435,456 | 512,458,829 | The projectGenerator plist appears above 313 MB compressed. The prefix reaches the first 32 bytes of the actual launcher at decoded offset 1,140,780,544. |

Each offset uses the checksum-matched artifact and the shortest prefix that the incremental zlib decoder accepts for the indicated decoded boundary. Actual scanner reads include metadata windows and decoder read-ahead. Preserve the 256 MiB ceiling for remote attempts and use local files for these pins.

### Combined branch results

The local-file reruns use the exact pinned SHA-256s and preserve the architecture declarations from the actual executable headers.

| Case | Bytes at 256 MiB on combined branch | Local bytes read | Status and decision |
| --- | ---: | ---: | --- |
| Aqua Data Studio | 268,435,452 | 835,675,421 | Needs more budget. Local verifies x86_64 and i386. |
| Insta360 Link Controller | 268,173,302 | 772,116,907 | Needs more budget. Local verifies x86_64 and arm64. |
| Papyrus | 268,435,452 | 716,043,951 | Needs more budget. Local verifies x86_64. |
| openFrameworks projectGenerator | 268,435,452 | 512,487,086 | Needs more budget. Local verifies x86_64 and arm64 for projectGenerator. The rest of the SDK has its own binaries. |

Each capped local-file test requested exactly 268,435,456 bytes. Its read count can differ from the ledger's URL scan by the discovery request and repeated reads.

### Additional packages at the capped tier

XAR range probes identified gzip payloads. The local passes used checksum-matching downloads except where the table notes a different digest. Cardinal has multiple independently compressed components. Its aggregate read count describes the current search order.

| Case and historical attempt | Bytes read before | Local bytes read after | Status and human decision |
| --- | ---: | ---: | --- |
| Arm Performix `e38906eda77f` | 268,173,301 | 345,620,388 | Needs more budget. Use local for the verified arm64 app. |
| BlueStacks Air `574d57418a63` | 268,173,301 | 1,025,295,279 | Needs more budget. Use local for the verified arm64 app. |
| Cardinal `5476c8168e25` | 268,173,295 | 914,592,468 | Needs more budget with the current component order. Local verifies the universal CardinalNative app. PackageInfo identifies its own component, so product-directed selection could reduce the combined read. |
| MAMP `96167649b183` | 426,590 | 677,220,919 | Needs a local file. The whole-stream origin requires at least 714,272,766 bytes to reach the requested metadata. The downloaded artifact verifies the universal MAMP app. |
| Microsoft Outlook `7abb09e2f13b` | 268,435,445 | 1,241,921,043 | Needs more budget. Use local for the verified universal app. |
| napari `ba8eec249bdf` | 268,173,301 | 531,366,387 on the publisher-digested asset | Catalog checksum conflict. The catalog SHA-256 starts `ca48a715`, while the bytes match GitHub asset 717202396's SHA-256 starting `221b9443`. That separate observation reaches the end of the payload without finding an app plist. Reconcile the manifest and identify the installed launcher. [Publisher release](https://github.com/napari/napari/releases/tag/v0.10.0) |
| Unity iOS Support `5784919ee40a` | 268,173,301 | 874,894,250 | Editor support package. The local scan finds no app plist. Select a specific deployed tool if its architecture matters. |
| Unity Android Support `e6407a899153` | 268,173,301 | 1,738,756,155 | Editor support package. The local scan finds no app plist. Select a specific deployed tool if its architecture matters. |

Other tar.gz attempts that failed at smaller tiers include Cursor CLI, LiClipse, JDK Mission Control and DeepL. Their recorded verified outcomes used 175,371,496, 163,643,392, 107,416,900 and 95,854,238 bytes respectively, all below the maximum tier. Historical transfer-only failures such as Cap's HTTP 429 require a successful origin response before measuring an archive prefix. Cursor's one-pass combined replay is covered in the regression table.

## Krisp 3.20.5

The checksum-matched 267,366,929-byte XAR puts the user app in `krisp-app.uli.pkg/Scripts`. That gzip CPIO member contains `postinstall` and `Krisp_app_3.20.5_arm64.pkg`. The script selects the nested package for the platform installer. Static extraction and an independent local scan verified `Applications/krisp.app/Contents/MacOS/krisp` as arm64 after reading 267,686,801 bytes of the inner XAR.

The ledger's stream attempt `88f489f7671c` read 267,364,498 bytes and reported no app plist. The combined baseline on a local file read 9,867 bytes and returned the same error. The regular Payload contains only directory and framing records. The new fallback inspects a declared postinstall component's gzip CPIO after a payload yields no bundle. It requires a single regular root-level PKG and records its path as nested evidence. It uses the same package parser and shares the scan's work and source limits. Backward XAR reads can replay the outer inflater without materializing the full nested archive in memory.

`pkg_verifies_the_single_app_package_stored_with_postinstall` uses a 1,869-byte generated fixture. It failed after 681 unique bytes with `not found: app Info.plist in sequential archive` and passes on all three profiles after the change.

The full installer now verifies arm64 locally after 267,032,977 unique bytes. It requests 1,068,167,867 bytes from the local file because it replays compressed data for the nested archive's index and metadata. The 256 MiB remote-profile control reads 267,032,977 unique bytes and exhausts its 268,435,456-byte request allowance. It exposes the nested package path with no architecture claim. Use the outer installer locally, or scan the statically extracted inner package locally for fewer repeated reads.

## LaTeXiT 1.15.0

Ledger attempt `35d1bb3e1265` recorded 232,059 source bytes and a missing display name and minimum. The pinned URL now downloads over TLS. The 4,825,693-byte image has observed SHA-256 `e62bffb51f33155cc5857fc14d780f1b0c78feded13530b83fddf003cfc4fc02`. Its base plist declares development region `English` and version 1.15.0. The 684-byte UTF-16LE `Contents/Resources/English.lproj/InfoPlist.strings` supplies the name. The base plist and the verified PPC and i386 load commands leave the minimum unknown. The publisher lists 10.4 as the release's minimum. That remains external compatibility evidence. [Publisher downloads and changelog](https://pierre.chachatelier.fr/latexit/latexit-downloads.php?lang=en)

The HFS reader fills the missing name from the base plist's declared development-region strings table after the primary verifies. Existing names retain precedence. The optional metadata read respects the existing source and deadline limits. The 2,247-byte `hfs_uses_the_embedded_name_from_development_region_strings` fixture failed with `None` instead of `Localized Fixture` and now passes in all three profiles. It also verifies that the minimum remains unknown. [Apple string resources](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/LoadingResources/Strings/Strings.html)

## Warp

| Route | Historical bytes read | Combined rerun | Status and decision |
| --- | ---: | ---: | --- |
| Homebrew stable_04 and stable_05 pins `ff05792ced2b` and `dc3dc689cb30` | 0 each | 0 each | Both versioned brew routes still return HTTP 404. Retain the old observations and replace the acquisition source if the catalog can use the vendor selector. |
| Official stable DMG selector | 268,435,456 at the maximum tier | 268,435,456 remote, 5,940,177 local parser bytes after a 343,072,502-byte download | Needs a local file. The public current artifact verifies x86_64 and arm64 locally. Choose local download or ask the origin to provide ranges. |

Warp's macOS download goes through `https://app.warp.dev/download?package=dmg`. It redirects to `releases.warp.dev/stable/v0.2026.11.18.08.17.stable_05/Warp.dmg`. The direct artifact returned HTTP 200 to both `bytes=0-0` and `bytes=-512`, with a weak ETag and without Content-Range or Content-Length. The UDIF `koly` footer is at byte 343,071,990. Sequential acquisition needs all 343,072,502 bytes to discover the length and read the footer. The observed SHA-256 starts `56c7caf4137c41ad`. This is a separate vendor artifact from either dead brew URL. [Warp downloads](https://www.warp.dev/download) · [Warp update documentation](https://docs.warp.dev/support-and-community/troubleshooting-and-support/updating-warp)

The pinned after-scan recovered `LaTeXiT` in both native profiles with the same source-byte counts as the before-scan, 1,901,642 for capped remote-cli on the file and 3,826,804 for local. Both headers still verify and `min_macos` remains empty. The name is fixed. Sam can decide whether to cite the vendor's 10.4 minimum separately in the catalog.

## BetterTouchTool 6.1169

The pinned 109,704,115-byte ZIP has ETag `"6b03ff00-689f3b3"`. The launcher's DEFLATE member expands to 162,519,616 bytes. The arm64 slice starts at decoded byte 86,867,968 and requires a 36,214,826-byte compressed prefix just to reach its header. A native 16-second replay verified both slices after 39,578,457 bytes and 82 requests. Optional framework inventory reached the timer. A 300 ms request-spacing control also verified both and stopped inventory at the timer after 39,468,005 bytes and 46 requests.

Two fixed costs were independent of the compressed prefix. ZIP asked the origin separately for each local header and its contiguous filename. The offline 1,189-byte ZIP64 fixture failed its eight-request assertion with ten reads. The updated scanner validates both fields in one read. Source-tools could also replace a verified primary with a candidate timeout when optional inventory ran out of time. `completed_primary_survives_a_deadline_during_optional_inventory` failed with `candidate deadline reached` before the status fix. The completed result now survives a post-primary deadline. Cancellation and representation failures remain visible.

The 120-second Source-tools baseline reproduced the false timeout after both verified headers, at 47,968,038 aggregate transfer bytes over 105 requests through the 8 and 64 MiB tiers. The 16-second Source-tools control reached only x86_64 and 1,647,136 bytes under its per-host pacing. That earlier deadline remains a genuine incomplete scan. The native route has a separate request cadence.

On the same saved ZIP and 64 MiB profile the result stayed complete and the source request count fell from 175 to 125. Both scans read 39,677,396 unique bytes. The combined 16-second live run verified both headers after 39,656,349 bytes over 81 requests, with optional inventory still partial. A complete framework inventory may need a longer run. The recorded acquisition failure `6036e71620d9` stopped after 42,213,633 transferred bytes and is separately covered by the earlier range-resume fixture.

The BetterTouchTool Source-tools after-run completed with verified status at 48,045,170 aggregate bytes over 99 requests. The matching old 120-second run reported a timeout at 47,968,038 bytes over 105 requests.

## Jabra Direct 8.4.30601

The 270,448,755-byte DMG (observed SHA-256 `f3a97ae47a367bb9fc0397650d3cffc572734b8cb6e368023bc74751cb5e26a1`) contains a 268,879,410-byte XAR inside APFS. The main component's single gzip member is 267,078,015 bytes. Its app launcher is CPIO record 5, at decoded byte 27,258. The app plist is record 929, at byte 700,435,322, and declares that exact launcher. The previous 64 MiB attempt `2eebddb5d3e6` read 66,949,763 bytes and stopped with both slices only as executable candidates. The matching file-backed control read 66,949,764. At 256 MiB the baseline verified the declared application after 267,203,025 bytes. The earlier ledger success `b99ce296a8f8` refers to the separate Avaya Integration helper.

The BOM records the app plist as ID 701 of 931, although the plist is near the CPIO trailer. Replaying from an actual DEFLATE block 24,213 compressed bytes from the end yielded identical record, plist and tail bytes with both missing-window seeds. The 64 KiB tail scan can use those bytes. The old heuristic vetoed the BOM entry because its ID was more than 32 from the end. The scanner now uses the BOM to establish the name, size and checksum and uses the CPIO suffix to establish position. Two independent dictionary seeds still have to agree. The 734,581-byte `pkg_uses_bom_identity_when_cpio_and_bom_orders_differ` fixture reproduced budget exhaustion after 352,246 unique bytes.

The exact-binary route also failed because APFS skipped its package fallback after an executable-path miss. The 75,751-byte `apfs_finds_a_declared_executable_inside_the_package` fixture reproduced that error at 1,970 bytes. APFS now checks for the requested installed file across the volumes before using the visible root package. Existing per-volume ambiguity checks apply to that fallback.

| Jabra scan | Before | After | Result and decision |
| --- | ---: | ---: | --- |
| Automatic, 64 MiB | 66,949,764 | 33,810,514 | Fixed. Verifies the app plist and both headers. Optional inventory remains incomplete. |
| Automatic, 8 MiB | 8,229,507 in ledger `90c29410db80` | 8,229,508 | Fixed. Verifies the app and both headers at the default tier with BOM-checked metadata. |
| Exact executable, 8 MiB | 49,114 | 228,054 | Fixed. Verifies x86_64 and arm64 at the exact installed path. Use this mode when the launcher alone answers the question. |
| Automatic baseline, 256 MiB | 267,203,025 | Use the verified 8 MiB result | The larger read is unnecessary for the primary. A separate inventory pass may still need extra budget. |

The live Azure range rerun verified the same Jabra version at 8,229,507 source bytes in automatic mode and 228,054 for the exact launcher. Both are real x86_64 and arm64 Mach-O headers.

## Access and publisher decisions

| Case | Bytes before | Bytes after | Status and legitimate route |
| --- | ---: | ---: | --- |
| SEGGER J-Link 9.96a `89268e29a0d0` | 27,647 HTML | 27,647 HTML, 512 in the probe | Needs attestation. Source-tools reproduced `needs_attestation`. An eligible user can complete the vendor's license and export-control flow and scan the saved package locally. [SEGGER downloads](https://www.segger.com/downloads/jlink/) · [SEGGER terms](https://www.segger.com/products/debug-probes/j-link/tools/terms-of-use/) |
| SAP BTP CLI 2.116.3 | 446,594 HTML | 446,594 HTML | Needs vendor consent. The response is the SAP Development Tools page with license and export-control material. Use the vendor's Mac download flow and scan the authorized archive. [SAP Development Tools](https://tools.hana.ondemand.com/#cloud-btpcli) |
| Send to Kindle pinned S3 URL | 0 installer bytes, HTTP 403 | 0 installer bytes, 243-byte AccessDenied XML | Pinned URL unavailable. The denial identifies the old S3 endpoint. Amazon's published Mac download flow is a separate route. [Amazon's Mac instructions](https://digprjsurvey.amazon.com/csad/help/node/TCUBEdEkbIhK07ysFu) |
| Hancom Word `b0804cedf5de` | 4 parser bytes | 82 HTML | Stale artifact route. The pinned URL still returns a meta-refresh document. Use the vendor's distribution channel for an eligible macOS package. [Hancom](https://www.hancom.com/) |
| Mac App Store handoffs | 0 installer bytes | 0 installer bytes from public listing metadata | Store handoff. Scan an authorized installed copy locally. The listing can identify the product and acquisition channel. [Pages resolver handoffs](PAGES.md) |

The probes used public GETs. The supported follow-up for an artifact the user acquires through the publisher's flow is `scan-cli scan FILE --profile local --json`.

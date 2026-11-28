# Bundle attempt index

[BUNDLE-ATTEMPTS.jsonl.gz](BUNDLE-ATTEMPTS.jsonl.gz) snapshots 1,103 attempts across 399 token and URL pairs. It includes 497 ledger attempts and 606 CLIMB and EDGE attempts. Rows carry the original outcome, pinned URL, available version, integrity evidence, selected target, scan limits, executable and architecture evidence, and their source locator. The source locator leads to the full original record, including inventories and read logs where recorded. An empty value means the original record does not supply that information.

Ledger locators are relative to `~/Code/doesitarm-data`. Campaign locators are relative to `~/Code/doesitarm-scanner-edge/scanner` and contain a JSON Pointer after `#`. The source hash tracks the exact campaign report used. Campaign and ledger rows can describe the same run. Preserve both locators when comparing them.

```sh
gzip -dc BUNDLE-ATTEMPTS.jsonl.gz | jq -c 'select(.token=="browserstacklocal")'
gzip -dc BUNDLE-ATTEMPTS.jsonl.gz | jq -c 'select(.failure_class=="other")'
python3 scripts/index-bundle-failures.py "$HOME/Code/doesitarm-data/scan-ledger" \
  "$HOME/Code/doesitarm-scanner-edge/scanner/results" | gzip -n > BUNDLE-ATTEMPTS.jsonl.gz
```

## The 24 full-climb plist failures

The two OpenZFS releases below count as distinct artifacts. Follow-up outcomes refer to the same token and pinned URL.

| Layout to investigate | Full-climb cases | Follow-up evidence |
| --- | --- | --- |
| Installer with a standalone CLI product or service | fx-cast-bridge, folding-at-home@beta, starnet2, orka3, dotnet-sdk@preview, dotnet-sdk@8, enclave, orka-vm-tools | Orka 3 and .NET SDK preview verified with explicit paths in EDGE. This pass verified exact executable targets for fx-cast Bridge, Folding@home beta, StarNet2 and Orka VM Tools. The recorded .NET SDK 8 and Enclave remote attempts reached their deadlines. Both later verified with explicit local payload targets. |
| Installer with an app, runtime, or extension | sys-pc-tool, openzfs (two variants), temurin, krisp, libndi, microsoft-openjdk@11, sshfs-mac | EDGE verified System PC Tool. Both OpenZFS attempts found partial metadata. The CPIO link fix verified Microsoft OpenJDK 11 on the pinned installer. Temurin and SSHFS have verified explicit executable paths, and libndi has a verified dynamic library target. Krisp's app component has an empty payload and remains open. |
| Disk image with a suite or missing app path | ampps, sketchup, tageditor, psi, chemdoodle, netlogo | The container branch verifies AMPPS. This pass verified NetLogo and ChemDoodle in enclosing directories, Psi by automatic discovery, and SketchUp by explicit target after discovering two suite apps. Tag Editor's vendor image holds `Tag Editor 2.app`, which differs from the pinned declaration. |
| ZIP with a versioned enclosing directory | ecamm-live | The catalog says `Ecamm/Ecamm Live.app`. The vendor ZIP contains `Ecamm v4.6.2/Ecamm Live.app`. A basename target verified both slices in the same representation. |
| Script-based installer archive | nvs | The checksum-matching tarball has an executable shell entry at `nvs-1.7.1/nvs` and separate sourced script contents. The application plist failure is expected for this layout. |

## Uncategorised outcomes

These are attempt counts, including replays and multiple tiers, from the source records labelled `other`. Groups use the literal errors.

| Group | Attempts | Evidence |
| --- | ---: | --- |
| CLI options rejected | 204 | All are in CLIMB `full-launch-error`, across 198 artifact rows. The compiled CLI rejected the arguments before opening an artifact. |
| HFS path not found | 44 | 41 LibreOffice language-pack attempts, two AI Studio attempts, one Sci-Hub EVA ledger attempt. The known LibreOffice legacy launcher path differs from the Sci-Hub EVA doubled `MacOS` path. AI Studio remains open. |
| Tar checksum failure | 6 | DMGs misrouted by their first compressed chunk in `codec-collision-regression`. Preview already probes the DMG footer first. |
| XZ stream failure | 6 | Older decoder runs, including the large dictionaries reproduced by the EDGE Archive fixtures. |
| Scan deadline | 5 | EDGE entries for Serviio, Wine, .NET SDK 8, Enclave, and openFrameworks. |
| APFS checkpoint limit | 3 | Earlier TI-SmartView runs. EDGE has a generated large checkpoint-ring regression. |
| Non-Mach-O entry point | 3 | Older Suunto DM5 and mitmproxy runs. Current declared targets require inspection of their actual file type. |
| ZIP end record missing | 2 | Earlier Empoche and Gingko attempts. EDGE documents the exact trailer lengths and bounded ZIP directory fix. |
| Range outside container | 2 | XAMPP's invalid DMG range is reproduced in the ledger. The container branch verifies the read-path fix. The outer result remains a shell launcher with helper inventory. |
| Compressed stream ended early | 1 | MailMate beta's concatenated bzip2 streams were verified and reproduced by EDGE. |

[Fix status](FIX-BUNDLES.md)

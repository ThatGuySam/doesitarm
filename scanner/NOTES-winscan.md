# Windows scanner resume notes

Branch `scanner-winscan` is based on `scanner-pages` at `12b3b2c`. Work locally. Use one build at a time with `cargo -j2`, no browser, and at most two HTTP requests overall and one per host. Keep download scratch in `~/.cache/doesitarm-winscan/` and remove it after use.

- [x] PE, Arm hybrid metadata, CLR, version resources, and fixture generator.
- [x] Installer and archive formats.
- [x] Windows result UI and conservative Mac listing lookup.
- [x] Range-only public download corpus and source documentation.
- [ ] Native, wasm, and Node test verification.

## Current checkpoint

- PE save point `0f60a9b` passes native profile tests.
- The installer, archive, and UI slices are implemented and committed.
- An initial live pass confirmed Microsoft Teams MSIX declarations on both x64 and ARM64 and a Spotify setup with product metadata. It exposed deep seeks in compressed ZIP members and a 7z configuration preface in Firefox's setup program. The current implementation caps ZIP PE prefix decoding and recognizes the preface. The final corpus includes those corrections.
- Microsoft symbol-server `ntdll.dll` and `KernelBase.dll` expose real ARM64X evidence. Steinberg publishes ARM64EC installer ZIPs with an MSI payload. Publisher evidence and scanned launcher evidence are distinct.
- The ARM64EC installer ZIP pass found x64 setup programs next to opaque MSI payloads. The scanner now preserves the observed wrapper architecture and leaves main-product architecture unknown. The native workspace suite covers this case.
- The evidence table is in [WINDOWS.md](WINDOWS.md). The range pass recorded 74 cases, with 69 usable range responses and 67 completed scans. The affected archives were rerun after the launcher fix.

# Windows scanner resume notes

Branch `scanner-winscan` is based on `scanner-pages` at `12b3b2c`. Work locally. Use one build at a time with `cargo -j2`, no browser, and at most two HTTP requests overall and one per host. Keep download scratch in `~/.cache/doesitarm-winscan/` and remove it after use.

- [x] PE, Arm hybrid metadata, CLR, version resources, and fixture generator.
- [x] Installer and archive formats.
- [ ] Windows result UI and conservative Mac listing lookup.
- [ ] Range-only public download corpus and source documentation.
- [ ] Native, wasm, and Node test verification.

## Current checkpoint

- PE save point `0f60a9b` passes native profile tests.
- The installer, archive, and UI slices are implemented. Their commits follow verification.
- An initial live pass confirmed Microsoft Teams MSIX declarations on both x64 and ARM64 and a Spotify setup with product metadata. It exposed deep seeks in compressed ZIP members and a 7z configuration preface in Firefox's setup program. The current implementation caps ZIP PE prefix decoding and recognizes the preface. The final corpus must rerun against that implementation.
- Microsoft symbol-server `ntdll.dll` and `KernelBase.dll` expose real ARM64X evidence. Steinberg publishes ARM64EC installer ZIPs with an MSI payload. Publisher evidence and scanned launcher evidence are distinct.

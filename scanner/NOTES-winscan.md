# Windows scanner resume notes

Branch `scanner-winscan` is based on `scanner-pages` at `12b3b2c`. Work locally. Use one build at a time with `cargo -j2`, no browser, and at most two HTTP requests overall and one per host. Keep download scratch in `~/.cache/doesitarm-winscan/` and remove it after use.

- [x] PE, Arm hybrid metadata, CLR, version resources, and fixture generator.
- [ ] Installer and archive formats.
- [ ] Windows result UI and conservative Mac listing lookup.
- [ ] Range-only public download corpus and source documentation.
- [ ] Native, wasm, and Node test verification.

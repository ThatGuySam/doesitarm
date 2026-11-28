# Agentsessions no key

AgentSessions 3.8.2 has a normal same-stem executable with no CFBundleExecutable key. The browser previously stopped at the missing key. Expect verified Mach-O slices and bundle_name_fallback. The test uses the repository fat binary instead of redistributing the release.

Run with `cargo test -j2 -p scan-cli --test bigfolder` from `scanner/`.

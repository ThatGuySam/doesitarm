# Symlink loop

An ancestor link and an alias app are present beside the real app. Native recursion skips both links. Expect the real app exactly once. The browser test measures behavior exposed by Chromium separately.

Run with `cargo test -j2 -p scan-cli --test bigfolder` from `scanner/`.

# Wrapper nested flat

A Wrapper directory contains a flat app with a binary plist and a root executable. The outer wrapper has no launcher of its own. Expect wrapper/no_executable on the outer app and nested_app/complete on the inner app, with its parent path attached.

Run with `cargo test -j2 -p scan-cli --test bigfolder` from `scanner/`.

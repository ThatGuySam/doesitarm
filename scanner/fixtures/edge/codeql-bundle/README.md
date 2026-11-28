# codeql-bundle

CodeQL ships a Zstandard-compressed tar tree. Decode the frame incrementally so tar traversal can distinguish the explicit executable and its runtime.

Version `2.27.5`. Original artifact 879,050,849 bytes. The fixture uses generated headers and stub bodies. [Pinned download](https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.27.5/codeql-bundle-osx64.tar.zst)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli codeql-bundle` from the scanner directory.

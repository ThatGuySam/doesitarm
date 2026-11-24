# wine-stable

The tar.xz contains five XZ blocks using 64 MiB LZMA2 dictionaries, and its app declares Wine Stable.app/Contents/MacOS/wine. The fixture reproduces the dictionary requirement and app path.

Version `11.0_1`. Original artifact 185,303,032 bytes. [Pinned download](https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.0_1/wine-stable-11.0_1-osx64.tar.xz)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli wine-stable` from the scanner directory.

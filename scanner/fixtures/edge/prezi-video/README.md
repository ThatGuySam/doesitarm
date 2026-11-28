# prezi-video

A deflated ZIP contains a large flat installer. PackageInfo is bzip2-compressed, declares /Applications/Prezi Video.app, and the CPIO stores Contents/ directly, including the main and a separate Sparkle helper. Decode the bounded metadata member before resolving the application.

Version `2.35.0`. Original artifact 221,106,557 bytes. [Pinned download](https://desktopassets.prezi.com/mac/prezi-video/releases/Prezi_Video_2.35.0.zip)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli prezi-video` from the scanner directory.

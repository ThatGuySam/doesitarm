# launchcontrol

The XZ stream uses CRC64 and a 64 MiB LZMA2 dictionary. The local and remote CLI profiles now permit the observed dictionary size. Worker reports its decoder limit.

Version `2.13.1`. Original artifact 5,510,472 bytes. The fixture uses generated headers and stub bodies. [Pinned download](https://www.soma-zone.com/download/files/LaunchControl-2.13.1.tar.xz)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli launchcontrol` from the scanner directory.

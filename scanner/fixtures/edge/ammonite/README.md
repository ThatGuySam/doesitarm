# ammonite

The XZ stream uses CRC64 and a 64 MiB LZMA2 dictionary. The local and remote CLI profiles now permit the observed dictionary size. Worker reports its decoder limit.

Version `1.30`. Original artifact 4,886,092 bytes. The fixture uses generated headers and stub bodies. [Pinned download](https://www.soma-zone.com/download/files/Ammonite-1.30.tar.xz)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli ammonite` from the scanner directory.

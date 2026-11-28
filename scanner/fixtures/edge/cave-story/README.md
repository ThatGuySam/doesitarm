# cave-story

The pinned DMG lacks a UDIF wrapper. It starts with a protective MBR and uses a GUID partition map. The fixture places a small HFS+ app inside a raw partitioned disk image.

Version `0.1.0,2`. Original artifact 10,020,864 bytes. Generated content contains synthetic Mach-O headers and stub bodies. [Pinned download](https://www.cavestory.org/downloads/cavestory_010_r2.dmg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli cave-story` from the scanner directory.

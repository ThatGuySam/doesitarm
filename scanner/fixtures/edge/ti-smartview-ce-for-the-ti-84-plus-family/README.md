# ti-smartview-ce-for-the-ti-84-plus-family

The old scanner stopped at its 128-block APFS checkpoint limit. This fixture uses a 256-block descriptor ring and places the valid checkpoint in the last block. Local scanning reads the ring in bounded batches. Worker retains its ring limit.

Version `6.0.3.619`. Original artifact 371,212,621 bytes. [Pinned download](https://d13g8g4x8s9rc1.cloudfront.net/downloads/files/cdn/smartview/84ce/6.0.3/TI-SmartView-CE-84-6.0.3.619.dmg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli ti-smartview-ce-for-the-ti-84-plus-family` from the scanner directory.

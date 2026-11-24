# gingko

The 373-entry ZIP has 112,332 bytes after its end record. Its central directory ends exactly at the record. The scanner now searches a bounded suffix and rejects apparent records whose directory range is inconsistent.

Version `2.4.15`. Original artifact 106,636,085 bytes. [Pinned download](https://github.com/gingko/client/releases/download/v2.4.15/Gingko-2.4.15-mac.zip)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli gingko` from the scanner directory.

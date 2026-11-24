# empoche

The 360-entry ZIP has 80,296 bytes after its end record. Its central directory ends exactly at the record. The scanner now searches a bounded suffix and rejects apparent records whose directory range is inconsistent.

Version `0.4.5`. Original artifact 74,945,413 bytes. [Pinned download](https://empoche-desktop.s3.amazonaws.com/Empoche-0.4.5-mac.zip)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli empoche` from the scanner directory.

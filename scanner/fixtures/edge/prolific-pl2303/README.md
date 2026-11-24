# prolific-pl2303

The 7z wraps a 574,186-byte XAR driver package. Its payload includes `Applications/PL2303Serial.app`. Read the indexed nested PKG while keeping package evidence separate from app metadata. The reduced fixture contains that app and a small driver stub.

Version `2.2.11,20250314,2025,07,_-1`. Original artifact 566,766 bytes. The fixture uses generated headers and stub bodies. [Pinned download](https://www.prolific.com.tw/wp-content/uploads/2025/07/PL2303HXD_G_Mac-Driver_v2.2.11_20250314.pkg_-1.7z)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli prolific-pl2303` from the scanner directory.

# libreoffice-still-language-pack

The HFS package has a language-pack launcher beside Info.plist and no Contents/MacOS directory. Static lookup now reports the launcher instead of the missing MacOS path.

Version `26.2.7`. Original artifact 3,723,740 bytes. [Pinned download](https://download.documentfoundation.org/libreoffice/stable/26.2.7/mac/aarch64/LibreOffice_26.2.7_MacOS_aarch64_langpack_ta.dmg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli libreoffice-still-language-pack` from the scanner directory.

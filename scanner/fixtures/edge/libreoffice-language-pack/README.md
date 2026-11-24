# libreoffice-language-pack

The HFS package has Contents/LibreOffice Language Pack but no Contents/MacOS directory. Follow the named direct child in this layout. The wrapper ships an AppleScript and language data rather than a native app binary.

Version `26.8.3`. Original artifact 3,692,099 bytes. [Pinned download](https://download.documentfoundation.org/libreoffice/stable/26.8.3/mac/x86_64/LibreOffice_26.8.3_MacOS_x86-64_langpack_ta.dmg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli libreoffice-language-pack` from the scanner directory.

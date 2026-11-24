# Contents relative bom

A UTF-8 BOM precedes the XML plist and the executable uses a Contents-relative location. Expect a verified Mach-O at Contents/Tools/Launch and xml_bom encoding.

Run with `cargo test -j2 -p scan-cli --test bigfolder` from `scanner/`.

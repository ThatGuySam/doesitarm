# tiptoi-manager 5.3

The 62,917,291-byte flat installer declares `install-location="/Applications/tiptoi® Manager.app"` in `internal.pkg/PackageInfo`. Its payload begins at `./Contents/`, including the named Mach-O and `Info.plist`. Mount the relative paths under the declared app location before matching the plist and executable.

[Source installer](https://files.tiptoi.ravensburger.cloud/Installer/5.3/tiptoi_Manager_Installer.pkg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli tiptoi-manager` from the scanner directory.

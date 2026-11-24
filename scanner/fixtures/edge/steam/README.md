# steam

The updater package begins with 20 non-ZIP bytes and wraps SteamMacBootstrapper.tar.gz inside the ZIP. The scanner validates the shifted ZIP and opens the nested tar. The observed bootstrap app is a separate representation from any app it may install later.

Version `6.1,1791918634,984652b88a9737e3f4e77c656d9ffa67d5042c2c`. Original artifact 4,825,452 bytes. Generated content contains synthetic Mach-O headers and stub bodies. [Pinned download](https://client-update.steamstatic.com/appdmg_osx.zip.984652b88a9737e3f4e77c656d9ffa67d5042c2c)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli steam` from the scanner directory.

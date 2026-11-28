# browserstacklocal

Info.plist is in the app bundle and declares MacOS/BrowserStackLocal.app. The actual member is Contents/MacOS/BrowserStackLocal.app, a regular thin Intel Mach-O. Resolve this Contents-relative spelling after exhausting the canonical lookup.

Version `3.7.8`. Original artifact 23,813,038 bytes. The fixture uses generated headers and stub bodies. [Pinned download](https://www.browserstack.com/local-testing/downloads/native-app/BrowserStackLocal.tar.gz)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli browserstacklocal` from the scanner directory.

# soothe2

The package installs separate AU, AAX, VST and VST3 bundles. This reduced XAR reproduces the early Mach-O and late plist with a declared VST3 bundle path. The scanner resolves the declared product as a plug-in in the fixture. In the complete vendor package, selecting `Library/Audio/Plug-Ins/VST3/soothe2.vst3` verifies the product. Automatic selection still returns `app Info.plist in sequential archive`.

Version `1.3.3`. Original artifact 280,414,366 bytes. Generated content contains synthetic Mach-O headers and stub bodies. [Pinned download](https://oeksound.ams3.cdn.digitaloceanspaces.com/soothe2_v133_Mac.pkg)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli soothe2` from the scanner directory.

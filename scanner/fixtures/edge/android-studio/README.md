# Android Studio 2026.2.2.10

The 1,542,370,765-byte Intel DMG and the 1,524,965,117-byte Arm DMG both contain universal `Contents/MacOS/studio` launchers. The runtime under `Contents/jbr/Contents/Home` matches each distribution's target architecture. The reduced fixture builds an HFS+ UDIF image with the same bundle structure and an LZFSE raw block. It includes an Intel-only `java` and `libjvm.dylib` and synthetic examples of the other bundle locations covered by the inventory.

[Intel DMG](https://edgedl.me.gvt1.com/android/studio/install/2026.2.2.10/android-studio-rabbit2-patch2-mac.dmg) · [Arm DMG](https://edgedl.me.gvt1.com/android/studio/install/2026.2.2.10/android-studio-rabbit2-patch2-mac_arm.dmg) · [Apple bundle structure](https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/BundleTypes/BundleTypes.html)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli android-studio` from the scanner directory.

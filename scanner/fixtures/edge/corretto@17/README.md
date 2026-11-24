# Amazon Corretto 17.0.21.1.2

The 187,110,305-byte arm64 PKG installs `amazon-corretto-17.jdk`. Its bundle executable is `Contents/MacOS/libjli.dylib`, and the CPIO lists a 69,632-byte `Contents/Home/bin/java`. The bundle inventory also needs to inspect the `Contents/Home` runtime tree. The fixture recreates the PKG and JDK with short Mach-O headers for the launcher, `java`, and `libjvm.dylib`.

[Source PKG](https://corretto.aws/downloads/resources/17.0.21.1.2/amazon-corretto-17.0.21.1.2-macosx-aarch64.pkg) · [OpenJDK runtime image layout](https://openjdk.org/jeps/220)

Run `python3 fixtures/edge/check.py --cli target/release/scan-cli corretto@17` from the scanner directory.

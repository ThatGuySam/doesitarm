# App status details

Context moved out of the status headlines on September 7, 2026. These are the existing compatibility reports and source links, preserved without a new compatibility review. A shorter headline does not change the reported status or resolve an outstanding verification gap.

## riscv-gnu-toolchain

🔶 Stable release verification needed; the RISC-V Homebrew tap provides an Apple Silicon Sequoia bottle built from main

[Package Evidence](https://github.com/riscv-software-src/homebrew-riscv/blob/43d32b832376b455a165bf91e41a2be22fabfe4d/riscv-gnu-toolchain.rb) [Installation](https://github.com/riscv-software-src/homebrew-riscv) [Discussion](https://github.com/ThatGuySam/doesitarm/issues/117)

## Tomcat

🔶 Runtime verification needed with an Apple Silicon native JDK; Tomcat 10.1 requires Java 11 or later

[Setup](https://tomcat.apache.org/tomcat-10.1-doc/setup.html) [Homebrew Package](https://formulae.brew.sh/formula/tomcat) [Discussion](https://github.com/ThatGuySam/doesitarm/issues/209)

## Unreal Engine

✅ Yes, Native Apple Silicon Support for the editor as of v5.2 via the Epic Games Launcher universal binary; plugin and rendering feature support varies

[Release Notes](https://www.unrealengine.com/tech-blog/unreal-engine-5-2-brings-native-support-for-apple-silicon-and-other-developments-for-macos)

## Gurobi Optimizer

✅ Yes, Native Apple Silicon Support as of v9.1; gurobipy requires a supported ARM64 Python version, and native MATLAB integration requires Gurobi 11 or later with MATLAB R2023b or later

[Python Support](https://support.gurobi.com/hc/en-us/articles/4409801941521) [MATLAB Support](https://support.gurobi.com/hc/en-us/articles/11243691152785)

## IBM ILOG CPLEX Optimization Studio

✅ Yes, Native Apple Silicon Support as of v22.1.1 using the macOS ARM64 distribution; Python interfaces must match the runtime architecture

[Release Announcement](https://community.ibm.com/community/user/discussion/cplex-optimization-studio-2211-is-available)

## MOSEK

✅ Yes, Native Apple Silicon Support in v11 using the osxaarch64 package; MATLAB integration requires native MATLAB R2023b or later

[Official FAQ](https://docs.mosek.com/11.2/faq.pdf)

## eqMac

✅ Yes, Native Apple Silicon binary, works well as of v0.3.7, Rosetta 2 lacks performance

[Tracked Issue](https://github.com/bitgapp/eqMac/issues/413)

## Universal Audio Software

Universal Audio lists UAD Software as native on Apple Silicon. The driver for
UAD-2 hardware such as Apollo, Satellite and UAD-2 PCIe cards requires Reduced
Security in macOS Recovery and approval of the system extension. Volt and other
devices that do not use UAD-2 do not require that setup. Check the compatibility
matrix for FireWire models and legacy plug-ins.

[UA native compatibility](https://help.uaudio.com/hc/en-us/articles/9314999013652-Native-Apple-Silicon-Compatibility) · [UAD-2 installation guide](https://help.uaudio.com/hc/en-us/articles/360057137692-Apple-Silicon-Compatibility-with-Universal-Audio-Products)

## rekordbox

The official macOS 7.2.20 installer contains a universal rekordbox executable.
The 6.8.8 installer contains an Intel executable that uses Rosetta 2 on Apple
Silicon. AlphaTheta announced native support in the 7.0 beta. The first stable
native build is unverified. Check AlphaTheta’s device list for your controller
and the download page for current macOS requirements.

[v7.2.20 macOS installer](https://cdn.rekordbox.com/files/20261119142403/Install_rekordbox_7_2_20.pkg_.zip) · [v6 download archive](https://rekordbox.com/en/support/faq/v6/#faq-q600141) · [v7 beta notes](https://rekordbox.com/en/2024/02/rekordbox-ver-7-beta/) · [Compatible DJ units](https://rekordbox.com/en/support/link/) · [macOS requirements](https://rekordbox.com/en/download/#system)

## Folx

✳️ Runs via Rosetta 2 translation with native support not reported to be in development

[Verification](https://github.com/ThatGuySam/doesitarm/issues/665#issue-899016989)

## Nisus Writer Express

✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta)

[Release notes](https://www.nisus.com/pro//whatsnew.php)

## Nisus Writer Pro

✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta)

[Release notes](https://www.nisus.com/pro//whatsnew.php)

## WhatsApp

✳️ Yes, works via Rosetta 2 as of v2.2049.10 with native support currently in beta

[Verification](https://github.com/ThatGuySam/doesitarm/issues/956) [Native Apple Silicon TestFlight Download](https://faq.whatsapp.com/545358030455627/?locale=en_GB)

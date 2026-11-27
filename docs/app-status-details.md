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

✳️ Yes, by setting the "Reduced Security option" security policy using macOS Recovery

[Knowledgebase Article](https://help.uaudio.com/hc/en-us/articles/360057137692-Apple-Silicon-M1-Compatibility-Info)

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

## GTKWave

✅ Runs natively when installed from the community Homebrew tap or built from source; the old prebuilt SourceForge bundle (3.3.107) is Intel-only and the maintainers say it is not compatible with current macOS. The project's install guide points Mac users to the tap or a source build, and users in the upstream discussion report running it on M1 Macs that way. One 2023 report says waveforms only displayed correctly on an external screen on Apple Silicon laptops.

[Install Guide](https://gtkwave.github.io/gtkwave/install/mac.html) [Discussion](https://github.com/gtkwave/gtkwave/issues/250) [Homebrew Tap](https://github.com/randomplum/homebrew-gtkwave/blob/main/gtkwave.rb)

## Solstice

✅ Native Apple Silicon client since v6.3.3. Mersive removed the Room Camera + Mic option from it, and Solstice video conferencing is no longer supported natively on Apple Silicon or Intel Macs. Version 6.3 was the final client built for Intel Macs and video conferencing.

[Release Notes](https://documentation.mersive.com/en/solstice/solstice-release-notes.html)

## CamTwist

✳️ CamTwist 3.4.3 is Intel-only, including its virtual camera plug-in, and runs via Rosetta 2. From macOS Sonoma 14.1, cameras that use the legacy plug-in architecture are unavailable by default, and a user reports CamTwist stopped appearing as a camera after that update. Apple documents a Recovery-mode Terminal command, `system-override legacy-camera-plugins-without-sw-camera-indication=on`, that restores legacy camera plug-ins; with it on, the menu-bar camera indicator does not appear for those cameras.

[Evidence](https://www.kotobato.jp/articles/tips/web-cam-trouble-caused-by-mmhmm.html) [Apple Support](https://support.apple.com/en-us/108387)

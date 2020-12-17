Does it ARM
----

Lists of reported app support for macOS on ARM so far. 

Any comments, suggestions? [Let us know!](https://github.com/ThatGuySam/doesitarm/issues). PRs welcome :) 

[Twitter Updates](https://twitter.com/DoesItARM)

[Do you want to help with M1 testing?](https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+is%3Aopen+label%3A%22Needs+M1+Testing%22+)

## Legend
* ✅ Yes, Full Native Apple Silicon Support
* ✳️ Yes, works via Rosetta 2
* ⏹ No, not working at all but support is in development
* 🚫 No, not yet supported only works on Intel-based Macs
* 🔶 Unknown, more info needed


## The Apps

#### Developer Tools

* [Android Studio](https://developer.android.com/studio) - ✳️ Yes, works via Rosetta 2, emulator only available as preview. - [Source](https://github.com/ThatGuySam/doesitarm/issues/48#issuecomment-732143252) [Emulator Issue](https://issuetracker.google.com/issues/173624439) [Emulator Preview Download](https://github.com/741g/android-emulator-m1-preview/releases)
* [Apache Maven](https://maven.apache.org/download.cgi) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/215#issuecomment-742910724)
* [App Preview Video Converter](https://apps.apple.com/us/app/app-preview-video-converter/id1137451860) - ✅ Yes, full native support as of v1.7.4 - [Release Notes](https://www.bridgetech.io)
* [Arduino IDE](https://www.arduino.cc/en/software) - ✳️ Reported working via Rosetta with native support currently in development - [Issue](https://github.com/arduino/Arduino/issues/10836)
* [Asset Catalog Creator](https://apps.apple.com/us/app/asset-catalog-creator-pro/id809625456) - ✅ Yes, full native support as of v3.7.4 - [Release Notes](https://www.bridgetech.io)
* [Atom](https://atom.io/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/307#issue-748524692) [Github Issue](https://github.com/atom/atom/issues/21078). 
* [Attributed String Creator](https://apps.apple.com/us/app/attributed-string-creator-pro/id730928349) - ✅ Yes, full native support as of v1.9.6 - [Release Notes](https://www.bridgetech.io)
* [BBEdit](https://www.barebones.com/products/bbedit/download.html) - ✅ Yes, full native support as of v13.5 - [Release Notes](https://www.barebones.com/support/bbedit/notes-13.5.html)
* [Beyond Compare](https://www.scootersoftware.com/) - ✳️ Yes, works via Rosetta 2 - [Facebook Post](https://www.facebook.com/ScooterSoftware/posts/5178865142127412)
* [CocoaPods](https://cocoapods.org/) - ✳️ Yes, it works via Rosetta 2 - [Issue](https://github.com/CocoaPods/CocoaPods/issues/9907)
* [CotEditor](https://coteditor.com) - ✅ Yes, full native support as of 4.0.0 - [App Store](https://itunes.apple.com/app/coteditor/id1024640650)
* [Cyberduck](https://cyberduck.io/download/) - ✳️ Yes, works via Rosetta 2 with native build in development - [Source](https://github.com/ThatGuySam/doesitarm/issues/333)
* [DBeaver](https://dbeaver.io/) - ✳️ Yes, works via Rosetta 2 using the pkg installer - [Issue Tracking](https://github.com/dbeaver/dbeaver/issues/10470)
* [Deno](https://deno.land/) - ✅ Yes, Full Native Apple Silicon Support - [Issue](https://github.com/denoland/deno/issues/8346)
* [Docker](https://www.docker.com/products#/mac) - 🚫 Not yet, but M1 builds are now available via the Preview Program - [Official Post](https://www.docker.com/blog/apple-silicon-m1-chips-and-docker/) [Github Issue](https://github.com/docker/for-mac/issues/4733#issuecomment-653444409) [M1 Preview and Download](https://www.docker.com/blog/download-and-try-the-tech-preview-of-docker-desktop-for-m1/)
* [Electron](https://www.electronjs.org/releases/stable) - ✅ Yes, full native support as of v11.0 - [Announcement](https://www.electronjs.org/blog/apple-silicon)
* [Filezilla](https://filezilla-project.org/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/17#issuecomment-729976000)
* [Flutter](https://flutter.dev/docs/get-started/install/macos) - ✳️ Yes, works via Rosetta 2 with native support in development - [Github Issue](https://github.com/flutter/flutter/issues/60118#issuecomment-695341296)
* [Fork](https://git-fork.com/) - ✅ Yes, full native support as of v2.1.0 - [Release notes](https://git-fork.com/releasenotes)
* [Git Version Control](https://git-scm.com/download/mac) - ✅ Yes, Full Native Apple Silicon Support - [Source](https://github.com/ThatGuySam/doesitarm/issues/54#issuecomment-730568063)
* [GitHub Desktop](https://desktop.github.com/) - ✳️ Yes, works via Rosetta 2 as of v2.6.0 with native support in development - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/293)
* [Go (golang)](https://golang.org/) - ✳️ Runs via Rosetta with native builds being tested - [Golang M1 Benchmark](https://docs.google.com/spreadsheets/d/1g4U7LAImfEcXRihJbySZcRr32tn6WSWAtslfXltds58/edit#gid=342445681) [Issue](https://github.com/golang/go/issues/38485)
* [Godot Engine](https://godotengine.org/) - ⏹ No official binaries yet, but can be compiled from source - [Master PR](https://github.com/godotengine/godot/pull/39788), [v3.2 PR](https://github.com/godotengine/godot/pull/39943)
* [Haskell](https://www.haskell.org/platform/mac.html) - 🚫 Not yet supported only works on Intel-based Macs - [Gitlab Issue](https://gitlab.haskell.org/ghc/ghc/-/issues/18664)
* [Hex Fiend](https://github.com/HexFiend/HexFiend/releases) - ✅ Yes, full native support as of v2.14.0 - [Source](https://github.com/ThatGuySam/doesitarm/issues/429)
* [Homebrew](https://brew.sh/) - ✳️ Yes, with caveats and some troubleshooting. - [Issue](https://github.com/Homebrew/brew/issues/7857). 
* [Hopper Disassembler](https://www.hopperapp.com/download.html) - ✅ Yes, Full Native Apple Silicon Support as of v4.6 - [Release Notes](https://www.hopperapp.com/blog/?p=263)
* [IntelliJ IDEA](https://www.jetbrains.com/idea/download/#section=mac) - ✳️ Runs via Rosetta 2, native support available as preview - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526) [Download Preview](https://youtrack.jetbrains.com/issue/JBR-2526#focus=Comments-27-4589077.0-0)
* [iTerm](https://iterm2.com/downloads.html) - ✅ Yes, fully supported as of v3.4.0 - [PR](https://github.com/gnachman/iTerm2/pull/421)
* [Julia Language](https://julialang.org/downloads/) - ✳️ Yes, it works via Rosetta 2 - [Github Issue](https://github.com/JuliaLang/julia/issues/36617)
* [LLVM Clang](https://releases.llvm.org/download.html) - ✳️ Yes, it works via Rosetta 2 - [Apple Forums](https://developer.apple.com/forums/thread/649992)
* [MacDown](https://macdown.uranusjr.com/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/382)
* [MacPorts](https://www.macports.org/install.php) - ✳️ Yes, some ports are native while others work via Rosetta 2. - [Discussion](https://github.com/ThatGuySam/doesitarm/issues/302). 
* [MAMP](https://www.mamp.info/en/mamp/mac/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/309)
* [MongoDB](https://www.mongodb.com/try/download/community) - ✅ Yes, Full Native Apple Silicon Support - [Test Video](https://youtu.be/b_S3CjGRQis?t=227)
* [MySQL Community Server](https://dev.mysql.com/downloads/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/173#issuecomment-730553003)
* [MySQL Workbench](https://dev.mysql.com/downloads/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/173#issuecomment-730553003)
* [NixOS](https://nixos.org/download.html) - 🚫 Not yet, but it’s in development - [Github Issue](https://github.com/NixOS/nixpkgs/issues/95903)
* [NodeJS](https://nodejs.org/en/) - ✳️ Yes, works via Rosetta 2 for Active LTS - [M1 Benchmark](https://docs.google.com/spreadsheets/d/1g4U7LAImfEcXRihJbySZcRr32tn6WSWAtslfXltds58/edit#gid=607735373) [Version Support](https://github.com/ThatGuySam/doesitarm/issues/299#issuecomment-733210648) [Github Issue](https://github.com/nodejs/TSC/issues/886)
* [Nova](https://nova.app) - ✅ Yes, Full Native Apple Silicon Support as of v3 - [Official Tweet](https://twitter.com/panic/status/1326977997732134912?s=20)
* [OCaml](https://ocaml.org/) - 🚫 Not yet, but it's currently in beta. - [Pull Status](https://github.com/ocaml/ocaml/pull/9699)
* [OpenJDK](https://openjdk.java.net/install/) - ⏹ Not yet, but there is an early build available. - [Java on M1 Benchmarks](https://docs.google.com/spreadsheets/d/1g4U7LAImfEcXRihJbySZcRr32tn6WSWAtslfXltds58/edit#gid=1469348209) [Azul Builds](https://www.azul.com/downloads/zulu-community/?os=macos&architecture=arm-64-bit&package=jdk) [Early Access Builds](https://github.com/microsoft/openjdk-aarch64/releases) [JEP Ticket](https://openjdk.java.net/jeps/391) [Discussion](https://bugs.openjdk.java.net/browse/JDK-8251280)
* [Parallels Desktop](https://www.parallels.com/) - ⏹ No, not working at all but support is in development - [Blog Post](https://www.parallels.com/blogs/parallels-desktop-apple-silicon-mac/)
* [PHPStorm](https://www.jetbrains.com/phpstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [Postman](https://www.postman.com/downloads/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/160#issuecomment-736772593)
* [Proxyman](https://proxyman.io) - ✅ Yes, fully supported ARM and Intel Chip - [Issue](https://github.com/ProxymanApp/Proxyman/issues/686)
* [PyCharm](https://www.jetbrains.com/pycharm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526) 
* [Python](https://www.python.org/) - ✅ Yes, reported working for v2.7.16, v3.8.2, and v3.9 - [PyPerformance Benchmarks](https://docs.google.com/spreadsheets/d/1g4U7LAImfEcXRihJbySZcRr32tn6WSWAtslfXltds58/edit#gid=1795089557) [Python Tracker](https://bugs.python.org/issue41100) [Github Issue](https://github.com/python/cpython/pull/22855) [Github Issue #2](https://github.com/ThatGuySam/doesitarm/issues/111)
* [React Native](https://reactnative.dev/) - 🔶 Unknown, more info needed - [Contribute](https://github.com/ThatGuySam/doesitarm/issues/427)
* [Redis](https://redis.io/download) - ✅ Yes, full native Apple Silicon support as of v6 - [v6.0.9 Benchmark](https://docs.google.com/spreadsheets/d/1g4U7LAImfEcXRihJbySZcRr32tn6WSWAtslfXltds58/edit#gid=1002181585) [Verification](https://github.com/ThatGuySam/doesitarm/issues/298)
* [Rust](https://www.rust-lang.org/) - ✳️ Runs via Rosetta 2 with native builds being tested - [Issue](https://github.com/rust-lang/rust/issues/73908#issue-648613557)
* [Sketch](https://www.sketch.com/) - ✅ Yes, Full Native Apple Silicon Support as of v70 - [Release Notes](https://www.sketch.com/updates/#version-70)
* [SourceTree](https://www.sourcetreeapp.com/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/200)
* [SubEthaEdit](https://subethaedit.net/) - ✅ Yes, full native Apple Silicon Support as of v5.1.5 - [Release Notes](https://github.com/subethaedit/SubEthaEdit/releases/tag/SubEthaEdit-MacFull-5.1.5)
* [Sublime Text](https://www.sublimetext.com/) - ✳️ Yes, works via Rosetta 2 - [Forum Discussion](https://forum.sublimetext.com/t/arm-build/5882/97)
* [Surge](https://nssurge.com/) - ✅ Yes, full native Apple Silicon Support as of v4.0.0 - [Issue](https://github.com/ThatGuySam/doesitarm/issues/157)
* [TensorFlow](https://www.tensorflow.org/) - ⏹ Not yet, but a supported pre-release is available - [Pre-Release](https://blog.tensorflow.org/2020/11/accelerating-tensorflow-performance-on-mac.html)
* [TablePlus](https://tableplus.com/)  - ✅ Yes, fully supported as of Build 352 - [Release Notes](https://twitter.com/TablePlus/status/1327650704295489536)
* [Tower](https://www.git-tower.com/mac) - ✅ Yes, fully supported as of v6 - [Release Notes](https://www.git-tower.com/blog/tower-mac-6/)
* [Transmit](https://panic.com/transmit/) - ✅ Yes, Full Native Apple Silicon Support as of v5.7 - [Official Tweet](https://twitter.com/panic/status/1326978002576666624?s=20)
* [Tunnelblick](https://tunnelblick.net/) - ✳️ Yes, works via Rosetta 2 - [Official Website](https://tunnelblick.net/cAppleSilicon.html)
* [Unity](https://store.unity.com/download) - ✳️ Runs via Rosetta with native support currently in development - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [VS Code](https://code.visualstudio.com/) - ✳️ Yes, works via Rosetta 2 with native support on insider builds - [Insider Download](https://code.visualstudio.com/docs/?dv=darwinarm64&build=insiders) [Issue](https://github.com/microsoft/vscode/issues/106770). 
* [Vysor](https://www.vysor.io/download/) - ✅ Yes, Full Native Apple Silicon Support - [Tweet](https://twitter.com/vysorapp/status/1329298424278093825)
* [WebStorm](https://www.jetbrains.com/webstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [Wireshark](https://www.wireshark.org/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/336)
* [Xcode](https://apps.apple.com/us/app/xcode/id497799835) - ✅ Yes, Full Native Apple Silicon Support as of v12.2 - [Release Notes](https://developer.apple.com/documentation/xcode-release-notes/xcode-12_2-release-notes)
* [Xojo](https://www.xojo.com/download/) - 🚫 Not yet, but it’s in development - [Blog Post](https://blog.xojo.com/2020/11/10/apple-silicon-and-big-sur-support-coming-in-xojo-2020r2/)
* [.NET](https://dotnet.microsoft.com/download) - ⏹ .NET Core nightly builds available, ongoing work for other frameworks - [Project Board](https://github.com/orgs/dotnet/projects/18)



#### Science and Research Software
* [IBM SPSS](https://www.ibm.com/analytics/spss-statistics-software) - ✳️ Yes, works via Rosetta 2 - [Official Post](https://community.ibm.com/community/user/datascience/blogs/todd-peterson1/2020/11/20/spss-statistics-on-macos-big-sur-110)
* [Matlab](https://www.mathworks.com/products/get-matlab.html?s_tid=gn_getml) - ✳️ Yes, works via Rosetta 2 as of v9.9.0.1495850 - [Matlab Forums](https://www.mathworks.com/matlabcentral/answers/641925-is-matlab-supported-on-apple-silicon-macs)
* [RStudio](https://rstudio.com/products/rstudio/download/) - ✳️ Yes, runs via Rosetta 2 with native support in development - [Source](https://github.com/ThatGuySam/doesitarm/issues/36) [Benchmark Info](https://github.com/ThatGuySam/doesitarm/issues/36#issuecomment-735668887)
* [Stata](https://www.stata.com/) - ✅ Yes, Full Native Apple Silicon Support as of v16, update level 10 Nov 2020 - [Blog Post](https://blog.stata.com/2020/11/10/stata-for-mac-with-apple-silicon/)



#### Music and Audio Tools

* [Ableton](https://www.ableton.com/en/live/) - ✳️ Yes, it works via Rosetta 2 - [Reddit Post](https://www.reddit.com/r/ableton/comments/jrtpv6/ableton_live_11_on_apple_silicon_m1_processor/gbvxj9r?context=3)
* [Airfoil](https://rogueamoeba.com/airfoil/mac/) - ⏹ No, not yet but support is in development - [Release Notes](https://rogueamoeba.com/airfoil/mac/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [Audacity](https://www.audacityteam.org/download/) - ✳️ Yes, it works via Rosetta 2 with no reported issues - [Github Issue Comment](https://github.com/audacity/audacity/issues/684#issuecomment-710726323)
* [Audio Hijack](https://rogueamoeba.com/audiohijack/) - ⏹ No, not yet but support is in development - [Release Notes](https://rogueamoeba.com/audiohijack/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [Avid Pro Tools](https://www.avid.com/pro-tools) - 🚫 No official word yet.
* [Capo](http://supermegaultragroovy.com/products/capo/mac/) - ✅ Yes, Full Native Apple Silicon Support as of v4 - [Official Post](https://supermegaultragroovy.com/products/capo/press/pr/2020-11-17/)
* [djay](https://www.algoriddim.com/) - ✅ Yes, Full Native Apple Silicon Support as of v3.0 - [Release Notes](https://www.algoriddim.com/djay-pro-mac/releasenotes)
* [eqMac](https://eqmac.app) - ✅ Yes, Native Apple Silicon binary, works well as of v0.3.7, Rosetta 2 lacks performance - [Tracked Issue](https://github.com/bitgapp/eqMac/issues/413)
* [Farrago](https://rogueamoeba.com/farrago/) - ✳️ Yes, works via Rosetta 2 as of v1.5.3 - [Release Notes](https://rogueamoeba.com/farrago/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [Fission](https://rogueamoeba.com/fission/) - ✳️ Yes, works via Rosetta 2 as of v2.6 - [Release Notes](https://rogueamoeba.com/fission/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [forScore](https://forscore.co/) - ✅ Yes, Full Native Apple Silicon Support as of v12 - [Official News](https://forscore.co/forscore-comes-to-the-mac/)
* [Fretello](https://apps.apple.com/us/app/fretello-guitar-lessons/id1107957482) - ✅ Yes, Full Native Apple Silicon Support as of v2.3.3 - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [Garageband](https://www.apple.com/mac/garageband/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1033)
* [Logic Pro](https://www.apple.com/logic-pro/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1037)
* [Loopback](https://rogueamoeba.com/loopback/) - ✅ Yes, Initial Native Apple Silicon Support as of v2.2.0 - [Release Notes](https://rogueamoeba.com/loopback/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [Native Access](https://www.native-instruments.com/en/specials/native-access/) - ⏹ No, not working at all but support is in development - [Official Status](https://support.native-instruments.com/hc/en-us/articles/360013515618-macOS-11-Big-Sur-Compatibility-News) [Official Post](https://support.native-instruments.com/hc/en-us/articles/360014683497)
* [Piezo](https://rogueamoeba.com/piezo/) - ✅ Yes, Initial Native Apple Silicon Support as of v1.7.0 - [Release Notes](https://rogueamoeba.com/piezo/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [SoundSource](https://rogueamoeba.com/soundsource/) - ✅ Yes, Initial Native Apple Silicon Support as of v5.2.0 - [Release Notes](https://rogueamoeba.com/soundsource/releasenotes.php) [Official Post](https://weblog.rogueamoeba.com/2020/11/16/rogue-amoeba-software-updates-for-macos-11-big-sur-and-m1-chip-based-macs/) 
* [Super 8 R2](https://www.native-instruments.com/en/products/komplete/synths/super-8/) - ⏹ No, not working at all but support is in development - [Official Status](https://support.native-instruments.com/hc/en-us/articles/360013515618-macOS-11-Big-Sur-Compatibility-News) [Official Post](https://support.native-instruments.com/hc/en-us/articles/360014683497)
* [Traktor DJ 2](https://www.native-instruments.com/en/products/traktor/dj-software/traktor-dj-2/) - ⏹ No, not working at all but support is in development - [Official Status](https://support.native-instruments.com/hc/en-us/articles/360013515618-macOS-11-Big-Sur-Compatibility-News) [Official Post](https://support.native-instruments.com/hc/en-us/articles/360014683497)
* [Traktor Pro 3](https://www.native-instruments.com/en/products/traktor/dj-software/traktor-pro-3/) - ⏹ No, not working at all but support is in development - [Official Status](https://support.native-instruments.com/hc/en-us/articles/360013515618-macOS-11-Big-Sur-Compatibility-News) [Official Post](https://support.native-instruments.com/hc/en-us/articles/360014683497)



#### Photo and Graphic Tools

* [Affinity Designer](https://affinity.serif.com/en-us/designer/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1219)
* [Affinity Photo](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/)
* [Affinity Publisher](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1286)
* [ArmorPaint](https://armorpaint.org/) - 🚫 No, not yet supported only works on Intel-based Macs
* [BrandBook](https://lighthouse16.com/brandbook/) - ✅ Yes, fully supported as of v1.1.2 - [Source](https://lighthouse16.com/journal/apple-silicon-support/)
* [Capture One](https://www.captureone.com/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/pull/130#issuecomment-736183868) [Capture One Twitter](https://twitter.com/captureonepro/status/1326570278462349312)
* [Darkroom](https://darkroom.co/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1307)
* [Darktable](https://www.darktable.org/install/#macos) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/328#issuecomment-736769770) [Discussion](https://discuss.pixls.us/t/the-future-of-darktable-on-the-mac-with-arm/21290)
* [Graphite Sketchbook](https://www.digitalmasterpieces.com/graphite/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1303)
* [Inkscape](https://inkscape.org/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/11#issuecomment-731507162)
* [Lightroom](https://www.adobe.com/products/photoshop-lightroom.html) - ✅ Yes, Full Native Apple Silicon Support - [Official Post](https://blog.adobe.com/en/2020/12/08/december-photography-updates.html) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5783)
* [Logoist 4](https://www.syniumsoftware.com/logoist) - ✅ Yes, Full Native Apple Silicon Support as of v4.1 - [Official News](https://www.syniumsoftware.com/synium-blog/apple-silicon-is-here-and-we-are-ready)
* [MacTeX](https://www.tug.org/mactex/mactex-download.html) - ✳️ Runs via Rosetta with native support currently in development - [Article](https://www.tug.org/mactex/aboutarm.html)
* [Mail Designer 365](https://maildesigner365.com) -  ✅ Yes, fully native support as of v2.0 - [Official page](https://www.maildesigner365.com/new-mail-designer-365-2-0-with-big-sur-optimization/)
* [Pixelmator Classic](https://apps.apple.com/cn/app/pixelmator-classic/id407963104?l=en&mt=12) - ✳️ Yes, works via Rosetta 2, no native upgrade planned - [Verification](https://github.com/ThatGuySam/doesitarm/issues/367)
* [Pixelmator Pro](https://pixelmator.com/pro) -  ✅ Yes, full native support as of v2.0
* [Photoshop](https://www.adobe.com/products/photoshop.html) - ✳️ Yes, works via Rosetta 2 with native support is in beta - [Beta Post](https://feedback.photoshop.com/conversations/photoshop-beta/photoshop-for-mac-arm-is-here/5fb359d3ca9d527a59c4677e) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5813)
* [Simple Comic](http://dancingtortoise.com/simplecomic/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/407)
* [Textify](https://apps.apple.com/app/id1522041836) - ✅ Yes, full native support as of v2.0.1 - [Macrumors Thread](https://forums.macrumors.com/threads/textify-text-recognition-ocr-made-easy-and-accurate-1-product-of-the-day-ph.2245225/page-2?post=29016938#post-29016938)
* [Vectornator](https://www.vectornator.io/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1300)



#### Video and Motion Tools

* [After Effects](https://www.adobe.com/products/aftereffects.html) - ⏹ Reportedly it's already supported - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [Autodesk Fusion 360](https://www.autodesk.com/products/fusion-360/overview) - ✳️ Yes, it was shown at the November 10th event running via Rosetta 2 - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1114)
* [Autodesk Maya](https://www.autodesk.com/products/maya/overview) - ✳️ Yes, it was shown at WWDC running via Rosetta 2 - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=6036)
* [Blender](https://www.blender.org/download/) - ✳️ Runs via Rosetta, however, Cycles rendering using GPU not supported  - [Issue Tracker](https://developer.blender.org/T78710) [Platforms State of the Union Clip](https://twitter.com/blendertoday/status/1275417203303727104?lang=en)
* [Cinebench](https://apps.apple.com/app/cinebench/id1438772273?l=en&mt=12) - ✅ Yes, full native support as of v23.200 - [Source](https://github.com/ThatGuySam/doesitarm/issues/39#issuecomment-729965712)
* [Cinema 4D](https://www.maxon.net/en/downloads) - ✅ Yes, Full Native Apple Silicon Support - [Release Notes](https://www.maxon.net/en/article/cinema-4d-r23-sp1-now-available) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=924)
* [Claquette](https://www.peakstep.com/claquette/) - ✅ Yes, Full Native Apple Silicon Support as of v2.1 - [Release Notes](https://www.peakstep.com/claquette/releasenotes.html)
* [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=950)
* [Final Cut Pro](https://www.apple.com/final-cut-pro/) - ✅ Yes, it will available on Apple Silicon launch - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1173) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5844)
* [Handbrake](https://handbrake.fr/) - ✅ Yes, natively supported as of v1.4.0  - [Github Issue](https://github.com/HandBrake/HandBrake/issues/2951)
* [MKVToolNix](https://mkvtoolnix.download/downloads.html#macosx) - ✳️ Yes, works via Rosetta 2 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/344)
* [OBS](https://obsproject.com/) - ✳️ Yes, works via Rosetta 2 - [MacRumors Discussion](https://forums.macrumors.com/threads/so-hows-m1-for-streamers-obs-streamlabs-obs-etc.2269239/) [Mention in Issue](https://github.com/obsproject/obs-studio/pull/3444#issuecomment-690216403)
* [Premiere Pro](https://www.adobe.com/products/premiere.html) - ⏹ Reportedly it's already supported - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [Tumult Hype](https://tumult.com/hype/) - ✅ Yes, Full Native Apple Silicon Support as of v4.1 - [Blog Post](https://blog.tumult.com/2020/11/23/introducing-tumult-hype-v4-1-with-apple-silicon-and-big-sur-compatibility/)
* [Vuo](https://vuo.org/download) -  ✳️ Runs via Rosetta with native support currently in development - [Source 1](https://vuo.org/comment/7265#comment-7265) [Source 2](https://vuo.org/comment/7781#comment-7781)



#### 3D and Architecture

* [Archicad](https://graphisoft.com/solutions/products/archicad) - 🚫 Not yet supported as of v24 - [Graphisoft Thread](https://archicad-talk.graphisoft.com/viewtopic.php?p=312614) [Reddit thread](https://www.reddit.com/r/ArchiCAD/comments/hsjs6l/archicad_and_macos_armtransition/)
* [AutoCAD](https://www.autodesk.com/products/autocad/overview?plc=ACDIST&term=1-YEAR&support=ADVANCED&quantity=1) - 🚫 Not yet supported only works on Intel-based Macs - [AutoDesk Forums](https://forums.autodesk.com/t5/autocad-for-mac-forum/apple-silicon/m-p/9652836)
* [Shaper3D](https://www.shapr3d.com/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=2211)
* [SketchUp](https://www.sketchup.com/) - ✳️ Yes, works via Rosetta 2 - [Discussion](https://forums.sketchup.com/t/the-new-m1-processor/141946)
* [Timebox 3D Collage Maker](https://timeboxapp.com/) - ✅ Yes, Full Native Apple Silicon Support as of v8.1 - [Release Notes](https://timeboxapp.com/whats-new-81)



#### Productivity Tools

* [Agenda](https://agenda.com/) - ✅ Yes, Full Native Apple Silicon Support - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [Airmail](https://airmailapp.com/) - ✅ Yes, Full Native Apple Silicon Support as of v4.5.1 - [Release History](https://apps.apple.com/app/apple-store/id918858936)
* [Alfred](https://www.alfredapp.com/universal/) - ✅ Yes, fully supported  - [Official Announcement](https://www.alfredapp.com/blog/announcements/alfred-ready-for-apple-m1-chip/)
* [AmorphousDiskMark](https://apps.apple.com/us/app/amorphousdiskmark/id1168254295) - ✅ Yes, full native Apple Silicon support as of v3.1
* [Amphetamine](https://apps.apple.com/app/amphetamine/id937984704) - ✅ Yes, full native Apple Silicon support from 5.1 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/295)
* [Axure RP 9](https://www.axure.com/download) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/38)
* [balenaEtcher](https://github.com/balena-io/etcher/releases) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/294#issuecomment-737011519)
* [Bartender](https://www.macbartender.com/) - ✅ Yes, fully supported as of v4.0.20 - [Blog](https://www.macbartender.com/b4blog/Apple-Silicon-Support/)
* [Bear](https://bear.app/) - ✅ Yes, fully supported as v1.8.2 - [Bear Blog Post](https://blog.bear.app/2020/11/bear-gets-new-widgets-and-ready-for-big-sur/)
* [BetterTouchTool](https://folivora.ai/) - ✅ Yes, fully supported as of v3.502 - [Issue Tracker](https://community.folivora.ai/)
* [Blackmagic Disk Speed Test](https://apps.apple.com/app/id425264550) - ✅ Yes, Full Native Apple Silicon Support - [Verification](https://github.com/ThatGuySam/doesitarm/issues/359#issuecomment-736255914)
* [Box Drive](https://www.box.com/resources/downloads) - ⏹ Not yet, but it's currently in development. - [Official Post](https://support.box.com/hc/en-us/community/posts/360051323454-Box-Drive-s-system-extension-failed-to-load?page=1#community_comment_1500000009302)
* [Chrome](https://www.google.com/chrome/) - ✅ Yes, fully supported as of v87 - [Article](https://9to5google.com/2020/11/17/chrome-mac-apple-silicon/)
* [coconutBattery](https://www.coconut-flavour.com/coconutbattery/) - ✅ Yes, full native support as of v3.9.2
* [Coloban](https://www.coloban.com) - ⏹ Not yet, but it's currently in development. - [Coloban Forum Issue](https://forum.coloban.com/index.php?u=/topic/21/new-arm-based-apple-computers)
* [CrossOver](https://www.codeweavers.com/) - ✳️ Runs via Rosetta 2 - [Official Blog](https://www.codeweavers.com/blog/jwhite/2020/11/10/its-great-to-live-in-interesting-times)
* [Day One Journal](https://apps.apple.com/app/id1055511498) - ✳️ Yes, works via Rosetta 2 - [Official Tweet](https://twitter.com/dayoneapp/status/1332727758447734784?s=20)
* [DEVONthink](https://www.devontechnologies.com/download/) - ✅ Yes, Full Native Apple Silicon Support as of v3.5.2 - [Release Notes](https://www.devontechnologies.com/blog/20200814-devonthink-352)
* [Drafts](https://itunes.apple.com/app/id1236254471?ls=1&mt=8&at=11l4Cf&ct=site) - ✅ Yes, Full Native Apple Silicon Support - [Official Tweet](https://twitter.com/draftsapp/status/1326263191601618945)
* [Dropbox](https://www.dropbox.com) - ✳️ Yes, works via Rosetta 2 as of v110.4.458 - [Forum Post](https://www.dropboxforum.com/t5/Dropbox-desktop-client-builds/Stable-Build-110-4-458/m-p/470973/highlight/true#M6110)
* [EasyConnect](https://lstratman.github.io/EasyConnect/) - 🔶 Unknown, more info needed - [Contribute](https://github.com/ThatGuySam/doesitarm/issues/219)
* [Fantastical](https://flexibits.com/fantastical) - ✅ Yes, Full Native Apple Silicon Support - [Media Post](https://www.macrumors.com/2020/11/12/fantastical-update-for-macos-big-sur-apple-silicon/)
* [Firefox](https://www.mozilla.org/en-US/firefox/new/) - ✅ Yes, Full Native Apple Silicon Support as of v84 - [Release Notes](https://www.mozilla.org/en-US/firefox/84.0/releasenotes/)
* [flickery](https://eternalstorms.at/flickery) - ✅ Yes, Full Native Apple Silicon Support as of v1.9.48 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)
* [Geekbench](https://www.geekbench.com/download/mac/) - ✅ Yes, full native support as of v5.3 - [Release Notes](https://www.geekbench.com/blog/2020/11/geekbench-53/)
* [Glimpses](https://eternalstorms.at/glimpses) - ✅ Yes, Full Native Apple Silicon Support as of v2.2.3 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)
* [Google Backup and Sync](https://www.google.com/drive/download/) - 🚫 Not yet supported, unknown if Apple or Google issue - [Google Thread](https://support.google.com/drive/thread/85225515?hl=en&msgid=86860457) | [Reddit Thread](https://www.reddit.com/r/macbookair/comments/k65aps/m1_mba_google_backup_sync_error_8b227910/?sort=new) | [MacRumours Thread](https://forums.macrumors.com/threads/google-backup-and-sync-not-working-on-m1.2269295/page-3)
* [GrandPerspective](https://apps.apple.com/app/grandperspective/id1111570163?mt=12) - ✅ Yes, Full Native Apple Silicon Support as of 2.5.3 - [Release Notes](http://grandperspectiv.sourceforge.net/)
* [HazeOver](https://hazeover.com/) - ✅ Yes, Full Native Apple Silicon Support as of 1.8.8 - [Official News](https://hazeover.com/news.html)
* [Highland 2](https://quoteunquoteapps.com/highland-2/) - ✅ Yes, Full Native Apple Silicon Support as of v2.9 - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [Highlights for Mac](https://highlightsapp.net/) - ✅ Yes, Full Native Apple Silicon Support as of v2020.3 - [Official Blog](https://highlightsapp.net/blog/2020/11/12/Time-for-change/)
* [IA Writer](https://apps.apple.com/us/app/ia-writer/id775737172) - ✅ Yes, Full Native Apple Silicon Support - [Official Twitter](https://twitter.com/iawriter/status/1326284671005696009?s=21)
* [iMazing 2](https://imazing.com/download) - ✳️ Yes, works via Rosetta 2 with native support in development - [Release notes](https://downloads.imazing.com/mac/iMazing/2.13.1.14452/release-notes.html)
* [Internal Phone Numbers](https://lighthouse16.com/internal-phone-numbers/) - ✅ Yes, fully supported as of v1.2.2 - [Source](https://lighthouse16.com/journal/apple-silicon-support/)
* [iStat Menus](https://bjango.com/mac/istatmenus/) - ✅ Yes, Full Native Apple Silicon Support as of v6.51 - [Official Twitter](https://twitter.com/bjango/status/1328863648270356482)
* [Karabiner-Elements](https://karabiner-elements.pqrs.org/) - ✅ Yes, Full Native Apple Silicon Support as of v13.0.0 - [Release Notes](https://karabiner-elements.pqrs.org/docs/releasenotes/#karabiner-elements-1300)
* [Keep It](http://reinventedsoftware.com/keepit/) - ✅ Yes, Full Native Apple Silicon Support as of v1.9 - [Official News](http://reinventedsoftware.com/news/)
* [Keka](https://mas.keka.io/) - ✅ Yes, Full Native Apple Silicon Support as of v1.2.2 - [App Store Link](https://mas.keka.io/)
* [Key Codes](https://manytricks.com/keycodes/) - ✅ Yes, Full Native Apple Silicon Support as of v2.2 - [Official Tweet](https://twitter.com/manytricks/status/1333456606449774595)
* [LaunchBar](https://www.obdev.at/products/launchbar/download.html) - ✅ Yes, Full Native Apple Silicon Support - [Source](https://github.com/ThatGuySam/doesitarm/issues/320)
* [Ledger Live](https://www.ledger.com/ledger-live/download) - ✳️ Yes, works via Rosetta 2 with native support in development - [Source](https://github.com/ThatGuySam/doesitarm/pull/396)
* [MacZip](https://ezip.awehunt.com/) - ✅ Yes, Full Native Apple Silicon Support as of v2.0 - [Release Notes](https://ezip.awehunt.com/)
* [Microsoft Edge](https://www.microsoft.com/en-us/edge) - ✳️ Yes, works via Rosetta 2, native Apple Silicon build available for insiders - [Insider Download](https://www.microsoftedgeinsider.com/en-us/download/canary)
* [Microsoft Excel](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5758)
* [Microsoft Office 365](https://www.microsoft.com/en-us/microsoft-365/office-365) -  ✅ Yes, Full Native Apple Silicon Support as of v16.44 - [Official Post](https://www.microsoft.com/en-us/microsoft-365/blog/2020/12/15/4-ways-microsoft-365-is-improving-the-experience-for-mac-users/) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5681) natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator) 
* [Microsoft Word](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5749)
* [MindNode](https://mindnode.com/) - ✅ Yes, Full Native Apple Silicon Support - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [Monero GUI Wallet](https://www.getmonero.org/downloads/) - ✳️ Yes, works via Rosetta 2 with a few minor bugs - [Source](https://github.com/ThatGuySam/doesitarm/issues/435)
* [Moom](https://manytricks.com/moom/) - ✅ Yes, Full Native Apple Silicon Support as of v3.2.20 - [Official Tweet](https://twitter.com/manytricks/status/1333456606449774595)
* [Nisus Writer Pro](https://nisus.com/pro/) - ✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta) - [Release notes](https://www.nisus.com/pro//whatsnew.php)
* [Nisus Writer Express](https://nisus.com/Express/) - ✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta) - [Release notes](https://www.nisus.com/pro//whatsnew.php)
* [Notion Desktop](https://www.notion.so) - ✅ Yes, Full Native Apple Silicon Support - [Official Tweet](https://twitter.com/NotionHQ/status/1333867094463582208?ref_src=twsrc%5Egoogle%7Ctwcamp%5Eserp%7Ctwgr%5Etweet) [Verification](https://github.com/ThatGuySam/doesitarm/issues/378#issue-755529762)
* [Noto](http://noto.ink/) - ✅ Yes, Full Native Apple Silicon Support - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [OmniFocus](https://www.omnigroup.com/omnifocus) - ✅ Yes, Full Native Apple Silicon Support as of v3.10 - [Release Notes](https://www.omnigroup.com/releasenotes/omnifocus)
* [OmniGraffle](https://www.omnigroup.com/omnigraffle) - ✅ Yes, Full Native Apple Silicon Support as of v7.18 - [Release Notes](https://www.omnigroup.com/releasenotes/omnigraffle)
* [OmniOutliner](https://www.omnigroup.com/omnioutliner) - ✅ Yes, Full Native Apple Silicon Support as of v5.8 - [Release Notes](https://www.omnigroup.com/releasenotes/omnioutliner)
* [OmniPlan](https://www.omnigroup.com/omniplan) - ✅ Yes, Full Native Apple Silicon Support as of v4.2 - [Release Notes](https://www.omnigroup.com/releasenotes/omniplan)
* [Parcel](https://parcelapp.net/) - ✅ Yes, Full Native Apple Silicon Support as of 6.6 - [Tweet](https://twitter.com/parcel_app/status/1325751301322362880)
* [PDF Viewer](https://pdfviewer.io/) - ✅ Yes, Full Native Apple Silicon Support as of v5.1 - [Blog Post](https://pdfviewer.io/blog/2020/pdf-viewer-5-1-for-ipad-iphone-mac/)
* [PDFelement](https://pdf.wondershare.com/pdf-editor-mac/) - ✅ Yes, fully supported ARM and Intel Chip - [Official Post](https://pdf.wondershare.com/macos/pdfelement-ready-for-apple-m1-chip.html)
* [Planny 4](https://www.kevinreutter.de/planny-4/) - ✅ Yes, Full Native Apple Silicon Support - [App Store Story](https://apps.apple.com/us/story/id1540024103)
* [Post-it®](https://apps.apple.com/app/post-it/id1475777828) - ✳️ Yes, runs via Rosetta 2, with native support coming soon - [Source](https://github.com/ThatGuySam/doesitarm/issues/197#issuecomment-732100064)
* [Quiet](https://lighthouse16.com/quiet/) - ✅ Yes, fully supported as of v2.6.7 - [Source](https://lighthouse16.com/journal/apple-silicon-support/)
* [Remotix](https://remotix.com/downloads-mac/) - ✅ Yes, fully supported as of v6.3 - [Release Notes](https://downloads.remotix.com/remotix-mac/release-notes.html?v=6.3)
* [Safari](https://www.apple.com/safari/) - ✅ Yes, fully supported
* [ScreenFloat](https://eternalstorms.at/ScreenFloat/) - ✅ Yes, Full Native Apple Silicon Support as of v1.5.18 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)
* [SeaDrive](https://www.seafile.com/en/download/) - 🚫 No, not yet supported only works on Intel-based Macs as of v2.0.9 - [Source](https://forum.seafile.com/t/seadrive-2-0-8-is-released-support-for-macos-11/13199/25)
* [SeaFile](https://www.seafile.com/en/download/) - ✳️ Yes, works via Rosetta 2 as of v7.0.10 - [Source](https://forum.seafile.com/t/native-support-for-apple-silicon/13390)
* [SiriMote](https://eternalstorms.at/sirimote) - ✅ Yes, Full Native Apple Silicon Support as of v1.3.9 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)
* [SnagIt](https://www.techsmith.com/download/snagit/) - ✳️ Yes, works via Rosetta 2 but without video capture - [Source](https://github.com/ThatGuySam/doesitarm/issues/413) [Official documentation](https://support.techsmith.com/hc/en-us/articles/360052555611-Snagit-and-Apple-Silicon-Compatibility-Info)
* [Synology Drive Client](https://www.synology.com/en-us/support/download/DDSM#utilities) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/399#issuecomment-742175817)
* [Tablecruncher](https://tablecruncher.com/download/) - ✅ Yes, Full Native Apple Silicon Support - [Official Post](https://tablecruncher.com/blog/2020/version-1.5.1-apple-silicon-ready/)
* [TeamViewer](https://www.teamviewer.com/en-us/) - ✅ Yes, Full Native Apple Silicon Support as of v15.12.4 - [Release Notes](https://community.teamviewer.com/t5/Change-Logs-EN/macOS-v15-12-4-Full-Change-Log/m-p/107706)
* [Thunderbird](https://www.thunderbird.net/en-US/) - ✳️ Yes, works via Rosetta 2 - [Bugzilla Tracker](https://bugzilla.mozilla.org/show_bug.cgi?id=1678775)
* [TouchSwitcher](https://hazeover.com/touchswitcher.html) - ✅ Yes, Full Native Apple Silicon Support as of 1.4 - [Official News](https://hazeover.com/news.html)
* [Transloader](https://eternalstorms.at/transloader/) - ✅ Yes, Full Native Apple Silicon Support as of v2.1.1 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)
* [Transmission](https://transmissionbt.com/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/326)
* [Things](https://culturedcode.com/things/mac/appstore/) - ✅ Yes, fully supported as of 3.13.2 - [Official Announcement](https://culturedcode.com/things/blog/2020/11/new-things-for-macos-big-sur/)
* [Ulysses](https://ulysses.app/) - ✅ Yes, Full Native Apple Silicon Support as of v21 - [MacRumors Article](https://www.macrumors.com/2020/11/13/apple-silicon-macs-universal-apps/)
* [Usher](https://manytricks.com/usher/) - ✅ Yes, Full Native Apple Silicon Support as of v2.0 - [Official Tweet](https://twitter.com/manytricks/status/1333456606449774595)
* [VMware Fusion](https://www.vmware.com/products/fusion.html) - ⏹ No, not working at all but support is in development - [Official Tweet](https://twitter.com/VMwareFusion/status/1326229094648832000)
* [VMWare Horizon Client](https://my.vmware.com/en/web/vmware/downloads/info/slug/desktop_end_user_computing/vmware_horizon_clients/horizon_8) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/297)
* [VMWare Remote Console](https://apps.apple.com/app/vmware-remote-console/id1230249825) - ✅ Yes, Full Native Apple Silicon Support as of v12.0.0 - [Release Notes](https://docs.vmware.com/en/VMware-Remote-Console/12.0/rn/VMware-Remote-Console-120-Release-Notes.html)
* [WPS Office](https://apps.apple.com/cn/app/wps-office/id1443749478?l=en&mt=12) - ✅ Yes, full native support as of v3.0.1 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/149)
* [Yoink](https://eternalstorms.at/yoink/mac/) - ✅ Yes, Full Native Apple Silicon Support as of v3.5.11 - [Blog Post](https://blog.eternalstorms.at/2020/11/09/app-update-galore/)



#### Entertainment and Media Apps

* [DOSBox](https://sourceforge.net/projects/dosbox/) - ✳️ Yes, it works via Rosetta 2 - [Project Ticket 149](https://sourceforge.net/p/dosbox/feature-requests/149/)
* [DOSBox-X](https://dosbox-x.com) - ✅ Yes, Full Native Apple Silicon Support as of 0.83.8 - [Github Release](https://github.com/joncampbell123/dosbox-x/releases/tag/dosbox-x-v0.83.8)
* [IINA](https://iina.io/download/) - ✳️ Yes, works via Rosetta with native support on the way - [Github Issue](https://github.com/iina/iina/issues/3067#issuecomment-671804703)
* [Movist](https://movistprime.com/) - ✅ Yes, Full Native Apple Silicon Support as of v2.6 - [Changelog](https://movistprime.com/changelog.html)
* [News Explorer](https://betamagic.nl/products/newsexplorer.html) - ✅ Yes, Full Native Apple Silicon Support as of v1.9.11 - [Blog Post](https://betamagic.nl/news/2020/2020_09.html)
* [QQ音乐(QQ Music)](https://apps.apple.com/cn/app/qq音乐-让生活充满音乐/id595615424?l=en&mt=12) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/368)
* [PPSSPP](https://build.ppsspp.org/?page/downloads#osx) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/347)
* [PS Remote Play](https://remoteplay.dl.playstation.net/remoteplay/lang/en/ps5_mac.html) - 🔶 Unknown, more info needed - [Contribute](https://github.com/ThatGuySam/doesitarm/issues/441)
* [RetroArch](https://www.retroarch.com/?page=platforms) - ✳️ Yes, works via Rosetta 2 with native support in development - [Verification](https://github.com/ThatGuySam/doesitarm/issues/348)
* [Spotify](https://www.spotify.com/us/download/mac/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/172)
* [Steam](https://store.steampowered.com/about/) - ✳️ Yes, reported working via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/153)
* [Tidal](https://tidal.com/download) - ✳️ Yes, working via Rosetta 2 but with occasional force quits as of 2.23.0.488 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/314)
* [Twitch](https://www.twitch.tv/downloads/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/387)
* [Vienna](https://github.com/ViennaRSS/vienna-rss/releases/latest) - ✅ Yes, Full Native Apple Silicon Support as of v3.6 - [Release Notes](https://github.com/ViennaRSS/vienna-rss/releases/tag/v/3.6.0)
* [VLC](https://www.videolan.org/index.html) - ✳️ Yes, reported working via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/21#issuecomment-728969937) [VLC Forums](https://forum.videolan.org/viewtopic.php?f=32&t=154539&p=507398&hilit=apple+silicon#p507398)



#### Social and communication

* [Cisco Webex Meetings](https://www.webex.com/downloads.html) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/59#issuecomment-731506903)
* [Discord](https://discord.com/download) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/192#issuecomment-734753133)
* [Microsoft Teams](https://www.microsoft.com/en-us/microsoft-365/microsoft-teams/group-chat-software) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/191#issuecomment-730561942)
* [QQ](https://im.qq.com/macqq/) - ✅ Yes, Full Native Apple Silicon Support as of v6.7.0.20110 - [Release Notes](https://im.qq.com/macqq/support.html)
* [QQ 体验版(MacCatalyst)](https://im.qq.com/macqq/)  - ✳️ Runs via Rosetta 2 
* [Signal](https://www.signal.org/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/337)
* [Slack](https://slack.com/) - ✳️ Yes, works via Rosetta 2 with native support in beta. - [Official Tweet](https://twitter.com/SlackEng/status/1326237727667314688)
* [Telegram](https://macos.telegram.org/) - ✅ Yes, Full Native Apple Silicon Support as of 7.2.4 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/52) [Changelog](https://macos.telegram.org/#v7-2-4-2020-11-29)
* [WeChat](https://apps.apple.com/cn/app/wechat/id836500024?l=en&mt=12) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/369)
* [Welly BBS](https://wellybbs.com/) - ✅ Yes, Full Native Apple Silicon Support as of Version 2020.9 - [App Store](https://apps.apple.com/us/app/id1521402269)
* [Zoom](https://zoom.us/download)  - ✳️ Yes, runs via Rosetta 2 - [Discussion](https://github.com/ThatGuySam/doesitarm/issues/134)



#### VPNs, Security, and Privacy

* [1Password](https://1password.com/) - ✳️ Runs via Rosetta with native support currently in development. - [Forum Discussion](https://1password.community/discussion/114181/will-1password-run-on-apple-silicon-based-mac)
* [Bitwarden](https://bitwarden.com/) - ✳️ Yes, works via Rosetta 2 with a patch in development - [Issue Tracker](https://github.com/bitwarden/desktop/issues/567)
* [Cisco AnyConnect Secure Mobility Client](https://www.cisco.com/c/en/us/products/security/anyconnect-secure-mobility-client/index.html) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/416#issue-760860704)
* [Elpass](https://elpass.app/) - ✅ Yes, full native Apple Silicon Support as of v1.1.10 - [Issue](https://github.com/ThatGuySam/doesitarm/issues/176)
* [Enpass](https://www.enpass.io/) - ✳️ Runs via Rosetta 2 - [Forum Discussion](https://discussion.enpass.io/index.php?/topic/24222-enpass-on-m1-mac-arm-silicon/&tab=comments#comment-56371)
* [GPG Suite](https://gpgtools.org/) - ✅ Yes, Full Native Apple Silicon Support as of 2020.2 - [Release notes](https://gpgtools.org/releases/gpgsuite/2020.2/release-notes.html?ni=1)
* [IVPN](https://www.ivpn.net/apps-macos/) - ✳️ Yes, works via Rosetta 2 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/315)
* [LastPass](https://www.lastpass.com/) - ✳️ Yes, works via Rosetta 2, but the Safari extension has issues  - [Verification](https://github.com/ThatGuySam/doesitarm/issues/233#issuecomment-731506984) [Release Notes](https://lastpass.com/upgrade.php?fromwebsite=1&releasenotes=1) [Safari Issue](https://community.logmein.com/t5/Support-Discussions/macOS-Big-Sur-Safari-14-0-1-Official-Support/m-p/256549)
* [Little Snitch](https://www.obdev.at/products/littlesnitch/index.html) - ✅ Yes, Full Native Apple Silicon Support from 5.0 - [Release notes](https://www.obdev.at/products/littlesnitch/releasenotes.html)
* [NordVPN](https://nordvpn.com/download/nordvpn-site/) - ✳️ Yes, works via Rosetta 2 - [Source](https://github.com/ThatGuySam/doesitarm/issues/317#issuecomment-736876490)
* [SecKey](https://lighthouse16.com/seckey/) - ✅ Yes, fully supported as of v1.3.3 - [Source](https://lighthouse16.com/journal/apple-silicon-support/)
* [Tor Browser](https://www.torproject.org/download/) - ✳️ Yes, works via Rosetta 2 but with a few page crashes - [Source](https://github.com/ThatGuySam/doesitarm/issues/436) [Issue tracker for tab crashes](https://gitlab.torproject.org/tpo/applications/tor-browser/-/issues/40262)
* [VeraCrypt](https://www.veracrypt.fr/en/Downloads.html) - ✳️ Yes, works via Rosetta 2 as of 1.24-Update8 - [GitHub issue](https://github.com/ThatGuySam/doesitarm/issues/355)
* [Vivaldi](https://vivaldi.com/download/) - ✳️ Yes, works via Rosetta 2 with native build in development - [Source](https://github.com/ThatGuySam/doesitarm/issues/331)
* [VPN Tracker 365](https://www.vpntracker.com) - ✅ Yes, fully native IPsec, L2TP, OpenVPN, SonicWALL SSL VPN support as of v 21.0 - [Official page](https://www.vpntracker.com/us/VPN-Client-for-macOS-Big-Sur.html)




<!--- end-of-list -->



## More Apple Silicon Lists
* [Is Apple silicon ready?](https://isapplesiliconready.com/) - Great list with detailed app status
* [Apple Silicon Games](https://applesilicongames.com/) - List of reported Games support including performance info. 
* [MacRumors List](https://forums.macrumors.com/threads/universal-and-native-apple-silicon-apps.2267176/) - List of Universal and Native Apple Silicon Apps
* [RoaringApps](https://roaringapps.com/collections/list-of-apple-silicon-native-apps) - List of apps ready for Apple Silicon M1 chip Macs
* [Laravel Supported Apps](https://laravelm1.tighten.co/) - List of Laravel-related apps and their status on Apple SIlicon
* [Big List](https://airtable.com/shribWFi8yrG9B1nh/tbl6aypsMfuofEaJi) - An Airtable List of over 400 apps and their support on Big Sur and Apple Silicon
* [Ivan Enderlin Twitter Thread](https://twitter.com/mnt_io/status/1327166454765150208?s=21) - A twitter thread with open status contributions
* [Does It ARM Twitter Thread](https://twitter.com/DoesItARM/status/1330027384041508865) - Does It ARM's own twitter thread for reporting and suggecting apps
* [Official Apple List](https://apps.apple.com/us/story/id1540024103) - Apple is a small tech company in Cupertino, CA


## Youtube Apple Silicon Playlists
* [Awais Mirza Video Tests](https://www.youtube.com/playlist?list=PLz5rnvLVJX5XF8cXAOQuarPIeP8Xr7b1_)
* [Andrew Tsai Game Benchmarks](https://www.youtube.com/playlist?list=PLFbqxkNlqrHNK0i4WN99Jc8g-qSbKoZEy)
* [Created Labs M1 Mackbook](https://www.youtube.com/playlist?list=PLcbQnQIwz6qSt-qsD3jCJaEw9fK8yXarA)
* [Tonyisgaming M1 Benchmarks](https://www.youtube.com/playlist?list=PLgz-h_Uy9AwOctqRcm6hEYEqTO9yIawoO)
* [DevChannel M1 Videos](https://www.youtube.com/playlist?list=PLEi3_qsqIyclc-3NqbEYlIvXEdcLXy1qX)
* [Ben G Kaiser - M1 for Creative Professionals](https://www.youtube.com/playlist?list=PL_9qmWdi19yCOCzAdTfFxpZtXonyfWTYJ)
* [Constant Geekery Apple Silicon](https://www.youtube.com/playlist?list=PLQncOO7KICBIH-1Jv3fhOOU9b3-j6XoED)




## License
Unless otherwise noted, this list available under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/), and the code is available under the [Apache-2.0](https://opensource.org/licenses/Apache-2.0). 

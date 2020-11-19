Does it ARM
----

Lists of reported app support for macOS on ARM so far. 

Any comments, suggestions? [Let us know!](https://github.com/ThatGuySam/doesitarm/issues). PRs welcome :) 

[Twitter Updates](https://twitter.com/DoesItARM)

## Legend
* ✅ Yes, Full Native Apple Silicon Support
* ✳️ Yes, works via Rosetta 2
* ⏹ No, not working at all but support is in development
* 🚫 No, not yet supported only works on Intel-based Macs


## The Apps

#### Developer Tools

* [Arduino IDE](https://www.arduino.cc/en/software) - ✳️ Reported working via Rosetta with native support currently in development - [Issue](https://github.com/arduino/Arduino/issues/10836)
* [Atom](https://atom.io/) - 🚫 No, not yet. - [Issue](https://github.com/atom/atom/issues/21078). 
* [BBEdit](https://www.barebones.com/products/bbedit/download.html) - ✅ Yes, full native support as of v13.5 - [Release Notes](https://www.barebones.com/support/bbedit/notes-13.5.html)
* [CocoaPods](https://cocoapods.org/) - ✳️ Yes, it works via Rosetta 2 - [Issue](https://github.com/CocoaPods/CocoaPods/issues/9907)
* [CotEditor](https://coteditor.com) - ✅ Yes, full native support as of 4.0.0 - [App Store](https://itunes.apple.com/app/coteditor/id1024640650)
* [Deno](https://deno.land/) - ✳️ Yes, works via Rosetta 2 - [Issue](https://github.com/denoland/deno/issues/8346)
* [Docker](https://www.docker.com/products#/mac) - 🚫 Not yet, but it’s in development - [Official Post](https://www.docker.com/blog/apple-silicon-m1-chips-and-docker/) [Github Issue](https://github.com/docker/for-mac/issues/4733#issuecomment-653444409)
* [Filezilla](https://filezilla-project.org/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/17#issuecomment-729976000)
* [Fork](https://git-fork.com/) - ✳️ Yes, works via Rosetta 2 - [Release notes](https://git-fork.com/releasenotes)
* [Go](https://golang.org/) - ✳️ Runs via Rosetta with native builds being tested - [Issue](https://github.com/golang/go/issues/38485)
* [Godot Engine](https://godotengine.org/) - ⏹ No official binaries yet, but can be compiled from source - [Master PR](https://github.com/godotengine/godot/pull/39788), [v3.2 PR](https://github.com/godotengine/godot/pull/39943)
* [Haskell](https://www.haskell.org/platform/mac.html) - 🚫 Not yet supported only works on Intel-based Macs - [Gitlab Issue](https://gitlab.haskell.org/ghc/ghc/-/issues/18664)
* [Homebrew](https://brew.sh/) - ✳️ Yes, with caveats and some troubleshooting. - [Issue](https://github.com/Homebrew/brew/issues/7857). 
* [Hopper Disassembler](https://www.hopperapp.com/download.html) - ✅ Yes, Full Native Apple Silicon Support as of v4.6 - [Release Notes](https://www.hopperapp.com/blog/?p=263)
* [IntelliJ Idea](https://www.jetbrains.com/idea/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [iTerm](https://iterm2.com/downloads.html) - ✅ Yes, fully supported as of v3.4.0 - [PR](https://github.com/gnachman/iTerm2/pull/421)
* [Julia Language](https://julialang.org/downloads/) - ✳️ Yes, it works via Rosetta 2 - [Github Issue](https://github.com/JuliaLang/julia/issues/36617)
* [LLVM Clang](https://releases.llvm.org/download.html) - ✳️ Yes, it works via Rosetta 2 - [Apple Forums](https://developer.apple.com/forums/thread/649992)
* [Matlab](https://www.mathworks.com/products/get-matlab.html?s_tid=gn_getml) - ✳️ Yes, works via Rosetta 2 as of v9.9.0.1495850 - [Matlab Forums](https://www.mathworks.com/matlabcentral/answers/641925-is-matlab-supported-on-apple-silicon-macs)
* [NixOS](https://nixos.org/download.html) - 🚫 Not yet, but it’s in development - [Github Issue](https://github.com/NixOS/nixpkgs/issues/95903)
* [Node](https://nodejs.org/en/) - ⏹ Working on v15 with patches to previous versions in the pipeline - [Platforms State of the Union Clip](https://twitter.com/blendertoday/status/1275417203303727104?lang=en)
* [Nova](https://nova.app) - ✅ Yes, Full Native Apple Silicon Support as of v3 - [Official Tweet](https://twitter.com/panic/status/1326977997732134912?s=20)
* [OCaml](https://ocaml.org/) - 🚫 Not yet, but it's currently in beta. - [Pull Status](https://github.com/ocaml/ocaml/pull/9699)
* [OpenJDK](https://openjdk.java.net/install/) - ⏹ Not yet, but there is an early build available. - [Early Access Build](https://github.com/microsoft/openjdk-aarch64/releases/tag/16-ea%2B10-macos) [JEP Ticket](https://openjdk.java.net/jeps/391) [Discussion](https://bugs.openjdk.java.net/browse/JDK-8251280)
* [PHPStorm](https://www.jetbrains.com/phpstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [Proxyman](https://proxyman.io) - ✅ Yes, fully supported ARM and Intel Chip - [Issue](https://github.com/ProxymanApp/Proxyman/issues/686)
* [PyCharm](https://www.jetbrains.com/pycharm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526) 
* [Python](https://www.python.org/) - ✅ Yes, reported working for v2.7.16, v3.8.2, and v3.9 - [Python Tracker](https://bugs.python.org/issue41100) [Github Issue](https://github.com/python/cpython/pull/22855) [Github Issue #2](https://github.com/ThatGuySam/doesitarm/issues/111)
* [Rust](https://www.rust-lang.org/) - ✳️ Runs via Rosetta 2 with native builds being tested - [Issue](https://github.com/rust-lang/rust/issues/73908#issue-648613557)
* [SubEthaEdit](https://subethaedit.net/) - ✅ Yes, full native Apple Silicon Support as of v5.1.5 - [Release Notes](https://github.com/subethaedit/SubEthaEdit/releases/tag/SubEthaEdit-MacFull-5.1.5)
* [Sublime Text](https://www.sublimetext.com/) - ✳️ Runs via Rosetta with native builds being tested - [Forum Discussion](https://forum.sublimetext.com/t/arm-build/5882/97)
* [TensorFlow](https://www.tensorflow.org/) - ⏹ Not yet, but a supported pre-release is available - [Pre-Release](https://blog.tensorflow.org/2020/11/accelerating-tensorflow-performance-on-mac.html)
* [TablePlus](https://tableplus.com/)  - ✅ Yes, fully supported as of Build 352 - [Release Notes](https://twitter.com/TablePlus/status/1327650704295489536)
* [Tower](https://www.git-tower.com/mac) - ✅ Yes, fully supported as of v6 - [Release Notes](https://www.git-tower.com/blog/tower-mac-6/)
* [Transmit](https://panic.com/transmit/) - ✅ Yes, Full Native Apple Silicon Support as of v5.7 - [Official Tweet](https://twitter.com/panic/status/1326978002576666624?s=20)
* [Unity](https://store.unity.com/download) - ✳️ Runs via Rosetta with native support currently in development - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [VS Code](https://code.visualstudio.com/) - ⏹ Currently supported on insider builds - [Insider Download](https://code.visualstudio.com/docs/?dv=darwinarm64&build=insiders) [Issue](https://github.com/microsoft/vscode/issues/106770). 
* [WebStorm](https://www.jetbrains.com/webstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [Xojo](https://www.xojo.com/download/) - 🚫 Not yet, but it’s in development - [Blog Post](https://blog.xojo.com/2020/11/10/apple-silicon-and-big-sur-support-coming-in-xojo-2020r2/)
* [.NET](https://dotnet.microsoft.com/download) - ⏹ .NET Core nightly builds available, ongoing work for other frameworks - [Project Board](https://github.com/orgs/dotnet/projects/18)



#### Music and Audio Tools

* [Ableton](https://www.ableton.com/en/live/) - ✳️ Yes, it works via Rosetta 2 - [Reddit Post](https://www.reddit.com/r/ableton/comments/jrtpv6/ableton_live_11_on_apple_silicon_m1_processor/gbvxj9r?context=3)
* [Audacity](https://www.audacityteam.org/download/) - ✳️ Yes, it works via Rosetta 2 with no reported issues - [Github Issue Comment](https://github.com/audacity/audacity/issues/684#issuecomment-710726323)
* [Avid Pro Tools](https://www.avid.com/pro-tools) - 🚫 No official word yet.
* [Garageband](https://www.apple.com/mac/garageband/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1033)
* [Logic Pro](https://www.apple.com/logic-pro/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1037)



#### Photo and Graphic Tools

* [Affinity Designer](https://affinity.serif.com/en-us/designer/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1219)
* [Affinity Photo](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/)
* [Affinity Publisher](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1286)
* [ArmorPaint](https://armorpaint.org/) - 🚫 No, not yet supported only works on Intel-based Macs
* [Capture One](https://www.captureone.com/) - 🚫 Not yet, but it's in development - [Capture One Twitter](https://twitter.com/captureonepro/status/1326570278462349312)
* [Darkroom](https://darkroom.co/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1307)
* [Graphite Sketchbook](https://www.digitalmasterpieces.com/graphite/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1303)
* [Lightroom](https://www.adobe.com/products/photoshop-lightroom.html) - ✅ Yes, it was shown at WWDC - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5783)
* [MacTeX](https://www.tug.org/mactex/mactex-download.html) - ✳️ Runs via Rosetta with native support currently in development - [Article](https://www.tug.org/mactex/aboutarm.html)
* [Pixelmator Pro](https://pixelmator.com/pro) -  ✅ Yes, full native support as of v2.0
* [Photoshop](https://www.adobe.com/products/photoshop.html) - ⏹ Not yet, but native support is in beta - [Beta Post](https://feedback.photoshop.com/conversations/photoshop-beta/photoshop-for-mac-arm-is-here/5fb359d3ca9d527a59c4677e) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5813)
* [Textify](https://apps.apple.com/app/id1522041836) - ✅ Yes, full native support as of v2.0.1 - [Macrumors Thread](https://forums.macrumors.com/threads/textify-text-recognition-ocr-made-easy-and-accurate-1-product-of-the-day-ph.2245225/page-2?post=29016938#post-29016938)
* [Vectornator](https://www.vectornator.io/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1300)



#### Video and Motion Tools

* [After Effects](https://www.adobe.com/products/aftereffects.html) - ⏹ Reportedly it's already supported - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [Autodesk Fusion 360](https://www.autodesk.com/products/fusion-360/overview) - ✳️ Yes, it was shown at the November 10th event running via Rosetta 2 - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1114)
* [Autodesk Maya](https://www.autodesk.com/products/maya/overview) - ✳️ Yes, it was shown at WWDC running via Rosetta 2 - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=6036)
* [Blender](https://www.blender.org/download/) - ✳️ Runs via Rosetta with native support currently in development - [Issue Tracker](https://developer.blender.org/T78710) [Platforms State of the Union Clip](https://twitter.com/blendertoday/status/1275417203303727104?lang=en)
* [Cinema 4D](https://www.maxon.net/en-us/products/cinema-4d/overview/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=924)
* [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=950)
* [Final Cut Pro](https://www.apple.com/final-cut-pro/) - ✅ Yes, it will available on Apple Silicon launch - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1173) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5844)
* [Handbrake](https://handbrake.fr/) - ✅ Yes, natively supported as of v1.4.0  - [Github Issue](https://github.com/HandBrake/HandBrake/issues/2951)
* [OBS](https://obsproject.com/) - 🚫 Not yet, but there has been some preparation for it. - [Mention in Issue](https://github.com/obsproject/obs-studio/pull/3444#issuecomment-690216403)
* [Premiere Pro](https://www.adobe.com/products/premiere.html) - ⏹ Reportedly it's already supported - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)



#### 3D and Architecture

* [Archicad](https://graphisoft.com/solutions/products/archicad) - 🚫 Not yet supported as of v24 - [Graphisoft Thread](https://archicad-talk.graphisoft.com/viewtopic.php?p=312614) [Reddit thread](https://www.reddit.com/r/ArchiCAD/comments/hsjs6l/archicad_and_macos_armtransition/)
* [AutoCAD](https://www.autodesk.com/products/autocad/overview?plc=ACDIST&term=1-YEAR&support=ADVANCED&quantity=1) - 🚫 Not yet supported only works on Intel-based Macs - [AutoDesk Forums](https://forums.autodesk.com/t5/autocad-for-mac-forum/apple-silicon/m-p/9652836)
* [Shaper3D](https://www.shapr3d.com/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=2211)
* [SketchUp](https://www.sketchup.com/) - ✳️ Yes, works via Rosetta 2 - [Discussion](https://forums.sketchup.com/t/the-new-m1-processor/141946)



#### Productivity Tools

* [1Password](https://1password.com/) - ✳️ Runs via Rosetta with native support currently in development. - [Forum Discussion](https://1password.community/discussion/114181/will-1password-run-on-apple-silicon-based-mac)
* [Alfred](https://www.alfredapp.com/universal/) - ✅ Yes, fully supported  - [Official Announcement](https://www.alfredapp.com/blog/announcements/alfred-ready-for-apple-m1-chip/)
* [Bartender](https://www.macbartender.com/) - ✅ Yes, fully supported as of v4.0.20 - [Blog](https://www.macbartender.com/b4blog/Apple-Silicon-Support/)
* [Bear](https://bear.app/) - ✅ Yes, fully supported as v1.8.2 - [Bear Blog Post](https://blog.bear.app/2020/11/bear-gets-new-widgets-and-ready-for-big-sur/)
* [BetterTouchTool](https://folivora.ai/) - ✅ Yes, fully supported as of v3.502 - [Issue Tracker](https://community.folivora.ai/)
* [Bitwarden](https://bitwarden.com/) - ⏹ Not yet, but a patch is in development - [Issue Tracker](https://github.com/bitwarden/desktop/issues/567)
* [Chrome](https://www.google.com/chrome/) - ✅ Yes, fully supported as of v87 - [Article](https://9to5google.com/2020/11/17/chrome-mac-apple-silicon/)
* [Coloban](https://www.coloban.com) - ⏹ Not yet, but it's currently in development. - [Coloban Forum Issue](https://forum.coloban.com/index.php?u=/topic/21/new-arm-based-apple-computers)
* [CrossOver](https://www.codeweavers.com/) - ✳️ Runs via Rosetta 2 - [Official Blog](https://www.codeweavers.com/blog/jwhite/2020/11/10/its-great-to-live-in-interesting-times)
* [DEVONthink](https://www.devontechnologies.com/download/) - ✅ Yes, Full Native Apple Silicon Support as of v3.5.2 - [Release Notes](https://www.devontechnologies.com/blog/20200814-devonthink-352)
* [Dropbox](https://www.dropbox.com) - ✳️ Yes, works via Rosetta 2 as of v110.4.458 - [Forum Post](https://www.dropboxforum.com/t5/Dropbox-desktop-client-builds/Stable-Build-110-4-458/m-p/470973/highlight/true#M6110)
* [Enpass](https://www.enpass.io/) - ✳️ Runs via Rosetta 2 - [Forum Discussion](https://discussion.enpass.io/index.php?/topic/24222-enpass-on-m1-mac-arm-silicon/&tab=comments#comment-56371)
* [Fantastical](https://flexibits.com/fantastical) - ✅ Yes, Full Native Apple Silicon Support [Media Post](https://www.macrumors.com/2020/11/12/fantastical-update-for-macos-big-sur-apple-silicon/)
* [Firefox](https://www.mozilla.org/en-US/firefox/new/) - ✳️ Yes, works via Rosetta 2 as of v83 - [Release Notes](https://www.mozilla.org/en-US/firefox/83.0/releasenotes/) 
* [GrandPerspective](https://apps.apple.com/app/grandperspective/id1111570163?mt=12) - ✅ Yes, Full Native Apple Silicon Support as of 2.5.3 [Release Notes](http://grandperspectiv.sourceforge.net/)
* [IA Writer](https://apps.apple.com/us/app/ia-writer/id775737172) - ✅ Yes, Full Native Apple Silicon Support - [Official Twitter](https://twitter.com/iawriter/status/1326284671005696009?s=21)
* [Karabiner-Elements](https://karabiner-elements.pqrs.org/) - ✅ Yes, Full Native Apple Silicon Support as of v13.0.0 - [Release Notes](https://karabiner-elements.pqrs.org/docs/releasenotes/#karabiner-elements-1300)
* [Keka](https://mas.keka.io/) - ✅ Yes, Full Native Apple Silicon Support as of v1.2.2 - [App Store Link](https://mas.keka.io/)
* [Microsoft Excel](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5758)
* [Microsoft Office 365](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, runs via Rosetta as of v16.43.20110804 with native support in beta. - [Beta Download](https://macadmins.software/silicon/) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5681) [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator) 
* [Microsoft Word](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5749)
* [Nisus Writer Pro](https://nisus.com/pro/) - ✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta) - [Release notes](https://www.nisus.com/pro//whatsnew.php)
* [Nisus Writer Express](https://nisus.com/Express/) - ✅ Yes, Full Native Apple Silicon Support as of v3.2 (some file conversion helpers run in Rosetta) - [Release notes](https://www.nisus.com/pro//whatsnew.php)
* [OmniFocus](https://www.omnigroup.com/omnifocus) - ✅ Yes, Full Native Apple Silicon Support as of v3.10 - [Release Notes](https://www.omnigroup.com/releasenotes/omnifocus)
* [OmniGraffle](https://www.omnigroup.com/omnigraffle) - ✅ Yes, Full Native Apple Silicon Support as of v7.18 - [Release Notes](https://www.omnigroup.com/releasenotes/omnigraffle)
* [OmniOutliner](https://www.omnigroup.com/omnioutliner) - ✅ Yes, Full Native Apple Silicon Support as of v5.8 - [Release Notes](https://www.omnigroup.com/releasenotes/omnioutliner)
* [OmniPlan](https://www.omnigroup.com/omniplan) - ✅ Yes, Full Native Apple Silicon Support as of v4.2 - [Release Notes](https://www.omnigroup.com/releasenotes/omniplan)
* [Safari](https://www.apple.com/safari/) - ✅ Yes, fully supported
* [Stata](https://www.stata.com/) - Yes ✅ Yes, Full Native Apple Silicon Support as of v15 - [Blog Post](https://blog.stata.com/2020/11/10/stata-for-mac-with-apple-silicon/)
* [Things](https://culturedcode.com/things/mac/appstore/) - ✅ Yes, fully supported as of 3.13.2



#### Entertainment and Media Apps

* [DOSBox](https://sourceforge.net/projects/dosbox/) - ✳️ Yes, it works via Rosetta 2 - [Project Ticket 149](https://sourceforge.net/p/dosbox/feature-requests/149/)
* [IINA](https://iina.io/download/) - ✳️ Yes, works via Rosetta with native support on the way - [Github Issue](https://github.com/iina/iina/issues/3067#issuecomment-671804703)
* [Spotify](https://www.spotify.com/us/download/mac/) - ✳️ Yes, works via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/172)
* [Steam](https://store.steampowered.com/about/) - ✳️ Yes, reported working via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/153)
* [Vienna](https://github.com/ViennaRSS/vienna-rss/releases/latest) - ✅ Yes, Full Native Apple Silicon Support as of v3.6 - [Release Notes](https://github.com/ViennaRSS/vienna-rss/releases/tag/v/3.6.0)
* [VLC](https://www.videolan.org/index.html) - ✳️ Yes, reported working via Rosetta 2 - [Verification](https://github.com/ThatGuySam/doesitarm/issues/21#issuecomment-728969937) [VLC Forums](https://forum.videolan.org/viewtopic.php?f=32&t=154539&p=507398&hilit=apple+silicon#p507398)



#### Social and communication

* [QQ](https://im.qq.com/macqq/) - ✅ Yes, Full Native Apple Silicon Support as of v6.7.0.20110 - [Release Notes](https://im.qq.com/macqq/support.html)
* [QQ 体验版(MacCatalyst)](https://im.qq.com/macqq/)  - ✳️ Runs via Rosetta 2 
* [Slack](https://slack.com/) - 🚫 Not yet, but it's currently in beta. - [Official Tweet](https://twitter.com/SlackEng/status/1326237727667314688)
* [Zoom](https://zoom.us/download)  - ✳️ Yes, runs via Rosetta 2 - [Discussion](https://github.com/ThatGuySam/doesitarm/issues/134)


Does it ARM
----

Lists of reported app support for macOS on ARM so far. 

Any comments, suggestions? [Let us know!](https://github.com/ThatGuySam/doesitarm/issues). PRs welcome :) 

## Legend
* ✅ Full Native Apple Silicon Support
* ✳️ Can run well enough via Rosetta or some other caveat
* ⏹ Expected to be supported when Apple Silicon is available
* 🚫 Not yet supported only works on Intel-based Macs


## The Apps

#### Developer Tools

* [Atom](https://atom.io/) - 🚫 No, not yet. - [Issue](https://github.com/atom/atom/issues/21078). 
* [BBEdit](https://www.barebones.com/products/bbedit/download.html) - ✅ Yes, full native support as of v13.5 - [Release Notes](https://www.barebones.com/support/bbedit/notes-13.5.html)
* [CocoaPods](https://cocoapods.org/) - ✅ Yes, it works via Rosetta 2 - [Issue](https://github.com/CocoaPods/CocoaPods/issues/9907)
* [CotEditor](https://coteditor.com) - ✅ Yes, full native support as of 4.0.0 - [App Store](https://itunes.apple.com/app/coteditor/id1024640650)
* [Deno](https://deno.land/) - 🚫 Not yet supported only works on Intel-based Macs - [Issue](https://github.com/denoland/deno/issues/8346)
* [Docker](https://www.docker.com/products#/mac) - ⏹ Expected to be supported at Apple Silicon launch - [Github Issue](https://github.com/docker/for-mac/issues/4733#issuecomment-653444409)
* [Go](https://golang.org/) - ✳️ Runs via Rosetta with native builds being tested - [Issue](https://github.com/golang/go/issues/38485)
* [Homebrew](https://brew.sh/) - ✳️ Yes, with caveats and some troubleshooting. - [Issue](https://github.com/Homebrew/brew/issues/7857). 
* [IntelliJ Idea](https://www.jetbrains.com/idea/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [iTerm](https://iterm2.com/downloads.html) - ✅ Yes, fully supported as of v3.4.0 - [PR](https://github.com/gnachman/iTerm2/pull/421)
* [Node](https://nodejs.org/en/) - ⏹ Working on v15 with patches to previous versions in the pipeline - [Platforms State of the Union Clip](https://twitter.com/blendertoday/status/1275417203303727104?lang=en)
* [OCaml](https://ocaml.org/) - 🚫 Not yet, but it's currently in beta. - [Pull Status](https://github.com/ocaml/ocaml/pull/9699)
* [OpenJDK](https://openjdk.java.net/install/) - ⏹ Not yet, but there is an early build available. - [Early Access Build](https://github.com/microsoft/openjdk-aarch64/releases/tag/16-ea%2B10-macos) [JEP Ticket](https://openjdk.java.net/jeps/391) [Discussion](https://bugs.openjdk.java.net/browse/JDK-8251280)
* [PHPStorm](https://www.jetbrains.com/phpstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
 * [Proxyman](https://proxyman.io) - ✅ Yes, fully supported ARM and Intel Chip - [Issue](https://github.com/ProxymanApp/Proxyman/issues/686)
* [PyCharm](https://www.jetbrains.com/pycharm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526) 
* [Python](https://www.python.org/) - ✅ Yes, reported working for v2.7.16, v3.8.2, and v3.9 - [Python Tracker](https://bugs.python.org/issue41100) [Github Issue](https://github.com/python/cpython/pull/22855) [Github Issue #2](https://github.com/ThatGuySam/doesitarm/issues/111)
* [Rust](https://www.rust-lang.org/) - ✳️ Runs via Rosetta with native support currently in development. - [Issue](https://github.com/rust-lang/rust/issues/73908#issue-648613557)
* [Sublime Text](https://www.sublimetext.com/) - ✳️ Runs via Rosetta with native builds being tested - [Forum Discussion](https://forum.sublimetext.com/t/arm-build/5882/97)
* [Unity](https://store.unity.com/download) - ✳️ Runs via Rosetta with native support currently in development - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)
* [VS Code](https://code.visualstudio.com/) - ⏹ Currently supported on insider builds - [Insider Download](https://code.visualstudio.com/docs/?dv=darwinarm64&build=insiders) [Issue](https://github.com/microsoft/vscode/issues/106770). 
* [WebStorm](https://www.jetbrains.com/webstorm/download/#section=mac) - ✳️ Runs via Rosetta with native support currently in development - [Official Jetbrains Issue](https://youtrack.jetbrains.com/issue/JBR-2526)
* [.NET](https://dotnet.microsoft.com/download) - ⏹ .NET Core nightly builds available, ongoing work for other frameworks - [Project Board](https://github.com/orgs/dotnet/projects/18)




#### Music and Audio Tools

* [Audacity](https://www.audacityteam.org/download/) - ✳️ Yes, it works via Rosetta 2 with no reported issues - [Github Issue Comment](https://github.com/audacity/audacity/issues/684#issuecomment-710726323)
* [Avid Pro Tools](https://www.avid.com/pro-tools) - 🚫 No official word yet.
* [Garageband](https://www.apple.com/mac/garageband/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1033)
* [Logic Pro](https://www.apple.com/logic-pro/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1037)



#### Photo and Graphic Tools

* [Affinity Designer](https://affinity.serif.com/en-us/designer/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1219)
* [Affinity Photo](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/)
* [Affinity Publisher](https://affinity.serif.com/en-us/publisher/) - ✅ Yes, fully supported as of v1.8.6 - [Press Release](https://affinity.serif.com/en-us/press/newsroom/affinity-apps-accelerate-with-macos-big-sur-and-native-m1-support/) [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1286)
* [Darkroom](https://darkroom.co/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1307)
* [Graphite Sketchbook](https://www.digitalmasterpieces.com/graphite/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1303)
* [Lightroom](https://www.adobe.com/products/photoshop-lightroom.html) - ✅ Yes, it was shown at WWDC - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5783)
* [Photoshop](https://www.adobe.com/products/photoshop.html) - 🚫 Not yet, reported available early 2021 - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=1092) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5813)
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
* [Shaper3D](https://www.shapr3d.com/) - ✅ Yes, it was shown at the November 10th event - [Apple Nov 10 Event](https://youtu.be/5AwdkGKmZ0I?t=2211)
* [Premiere Pro](https://www.adobe.com/products/premiere.html) - ⏹ Reportedly it's already supported - [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator)



#### Productivity Tools

* [1Password](https://1password.com/) - ✳️ Runs via Rosetta with native support currently in development. - [Forum Discussion](https://1password.community/discussion/114181/will-1password-run-on-apple-silicon-based-mac)
* [Alfred](https://www.alfredapp.com/universal/) - ✅ Yes, fully supported  - [Official Announcement](https://www.alfredapp.com/blog/announcements/alfred-ready-for-apple-m1-chip/)
* [Bear](https://bear.app/) - 🚫 Not yet, but it's in development - [Bear Twitter](https://twitter.com/BearNotesApp/status/1328271208748638213)
* [BetterTouchTool](https://folivora.ai/) - ✅ Yes, fully supported as of v3.502 - [Issue Tracker](https://community.folivora.ai/)
* [Chrome](https://www.google.com/chrome/) - ⏹ No, not yet but reportedly Chrome beta is working. - [Apple Forums Issue](https://developer.apple.com/forums/thread/657657) [Google Forums Issue](https://support.google.com/chrome/thread/64355557?hl=en)
* [Coloban](https://www.coloban.com) - ⏹ Not yet, but it's currently in development. - [Coloban Forum Issue](https://forum.coloban.com/index.php?u=/topic/21/new-arm-based-apple-computers)
* [CrossOver](https://www.codeweavers.com/) - ✳️ Runs via Rosetta 2 - [Official Blog](https://www.codeweavers.com/blog/jwhite/2020/11/10/its-great-to-live-in-interesting-times)
* [Firefox](https://www.mozilla.org/en-US/firefox/new/) - ⏹ Not yet, but it's currently in development. - [Bugzilla Tracker](https://bugzilla.mozilla.org/show_bug.cgi?id=1648496)
* [Microsoft Excel](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5758)
* [Microsoft Office 365](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, runs via Rosetta as of v16.43.20110804 with native support in beta. - [Beta Download](https://macadmins.software/silicon/) [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5681) [CNET Article](https://www.cnet.com/news/microsoft-365-and-adobe-creative-cloud-will-support-mac-arm-natively/#:~:text=At%20its%20annual%20Worldwide%20Developers,which%20it%20calls%20Apple%20silicon.&text=Adobe's%20Creative%20Cloud%20software%20includes,InDesign%2C%20Premiere%20Pro%20and%20Illustrator) 
* [Microsoft Word](https://www.microsoft.com/en-us/microsoft-365/office-365) - ✅ Yes, it was shown at WWDC - [WWDC Preview](https://youtu.be/GEZhD3J89ZE?t=5749)
* [Safari](https://www.apple.com/safari/) - ✅ Yes, fully supported
* [Things](https://culturedcode.com/things/mac/appstore/) - ✅ Yes, fully supported as of 3.13.2



#### Entertainment and Media Apps

* [IINA](https://iina.io/download/) - ✳️ Yes, works via Rosetta with native support on the way - [Github Issue](https://github.com/iina/iina/issues/3067#issuecomment-671804703)
* [Spotify](https://www.spotify.com/us/download/mac/) - 🚫 No, not yet.
* [VLC](https://www.videolan.org/index.html) - 🚫 No official word yet, but preparation has been made. - [VLC Forums](https://forum.videolan.org/viewtopic.php?f=32&t=154539&p=507398&hilit=apple+silicon#p507398)




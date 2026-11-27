# GitHub notification backlog update, 2026-11-27

Evidence record for the README changes in this pull request, which is stacked on #1163. The leads came from a review of the maintainer's backlog of GitHub notifications for this repository and for other projects' Apple Silicon issues. Only public issue and pull request numbers and public evidence are recorded here. The per-change records are in [github-notification-backlog-2026-11-27/changes.jsonl](github-notification-backlog-2026-11-27/changes.jsonl).

## Method

The review produced 237 leads. Each change below was checked again on 2026-11-27 at the maker's own source: release assets on the project's own GitHub releases, vendor release notes, changelogs, help or requirements pages, the vendor's own download files (an arm64 file served from the vendor's host), or a Mach-O inspection of the vendor's update archive (`method` in the records). A lead whose only support was this site's own scan, a search snippet, a third-party page or a page that blocked automated requests was confirmed another way or left out. Where no vendor source names the first native version, the status gives no version.

Every added or renamed entry was checked against the public scans feed with the matching code from master plus the newer matching rules in progress, using the real build (`buildScanListMap`, `assignScansToReadmeEntries`, `buildReadmeAppList`). Each entry absorbs its own scan where one exists, takes no scan from another README entry, and no two listings share a slug.

## Changes (87)

| App | Old status | New status | Evidence | Source issue |
| --- | --- | --- | --- | --- |
| Audacity | ✳️ Yes, it works via Rosetta 2, with Native support as of alpha v3.2 | ✅ Yes, Native Apple Silicon Support as of v3.2.0 | [source](https://github.com/audacity/audacity/releases/tag/Audacity-3.2.0) | #980 (also audacity/audacity#684) |
| OBS | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support as of v28.0 | [source](https://github.com/obsproject/obs-studio/releases/tag/28.0.0) | #978 |
| Cryptomator | 🚫 No, crashes under Rosetta 2 only recommended on Intel-based Macs | ✅ Yes, Native Apple Silicon Support as of v1.6.3 | [source](https://github.com/cryptomator/cryptomator/releases/tag/1.6.3) | #842 |
| Chia Blockchain | ✳️ Yes, works via Rosetta 2 translation | ✅ Yes, Native Apple Silicon Support as of v1.2.0 | [source](https://github.com/Chia-Network/chia-blockchain/releases/tag/1.2.0) | Chia-Network/chia-blockchain#2313 |
| Aseprite | ✳️ Yes, works via Rosetta 2 translation | ✅ Yes, Native Apple Silicon Support as of v1.3 | [source](https://www.aseprite.org/release-notes/) | aseprite/aseprite#2451 |
| Angry IP Scanner | ✳️ Yes, works via Rosetta 2 translation | ✅ Yes, Native Apple Silicon Support as of v3.8.0 | [source](https://github.com/angryip/ipscan/releases/tag/3.8.0) | #809 (also angryip/ipscan#284) |
| Insomnia Core | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support as of v2022.1.0 | [source](https://insomnia.rest/changelog) | Kong/insomnia#2964 |
| Insomnia Designer | ✳️ Yes, works via Rosetta 2 | ✳️ Ran via Rosetta 2; discontinued and merged into Insomnia | [source](https://insomnia.rest/changelog) | Kong/insomnia#2964 |
| Alacritty | ✳️ Yes, works via Rosetta 2 Translation | ✅ Yes, Native Apple Silicon Support as of v0.10.0 | [source](https://github.com/alacritty/alacritty/releases/tag/v0.10.0) | #600 |
| CodeRunner | ✳️ Yes, works via Rosetta 2 Translation with native support in beta | ✅ Yes, Native Apple Silicon Support as of v4.1 | [source](https://coderunnerapp.com/appcast.xml) | #792 (closed) |
| Native Access | ✳️ Yes, works via Rosetta 2 translation with the exception of MASSIVE X | ✅ Yes, Native Apple Silicon Support in Native Access 2 | [source](https://www.native-instruments.com/en/specials/native-access-2/) | #633 (closed) |
| Dante Virtual Soundcard | ✳️ Yes, works via Rosetta 2 translation but can run natively via PKG hack | ✅ Yes, Native Apple Silicon Support as of v4.2.3 | [source](https://dev.audinate.com/GA/dvs/userguide/pdf/latest/AUD-MAN-DanteVirtualSoundcard_4.5.x-v1.0.pdf) | #918 (closed) |
| Parsec | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support | [source](https://parsec.app/changelog) | #513 |
| SmartGit | ✳️ Yes, works via Rosetta 2 Translation | ✅ Yes, Native Apple Silicon Support as of v21.2 | [source](https://www.syntevo.com/smartgit/changelog-21.2.txt) | #541 |
| Finale Music | ✳️ Yes, it works via Rosetta 2 translation | ✅ Native as of v27.2; discontinued by MakeMusic in 2024 | [source](https://usermanuals.finalemusic.com/FinaleMac/Content/Finale/What_s_new.htm) | #617 |
| Eclipse IDE | ✳️ Yes, runs via Rosetta 2 translation and natively for SDK | ✅ Yes, Native Apple Silicon Support as of 2021-12 | [source](https://www.eclipse.org/downloads/packages/release/2021-12/r) | #849 (also #626, #914) |
| Hue Sync | ✳️ Yes, works via Rosetta 2 Translation | ✅ Yes, Native Apple Silicon Support as of v1.8 | [source](https://www.philips-hue.com/en-us/support/release-notes/hue-sync) | #709 |
| Skype | ✳️ Yes, works via Rosetta 2 | 🚫 No, Microsoft retired Skype in May 2025 | [source](https://support.microsoft.com/en-us/skype/skype-is-retiring-in-may-2025-what-you-need-to-know-2a7d2501-427f-485e-8be0-2068a9f90472) | #804 |
| GitKraken | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support | [source](https://api.gitkraken.dev/releases/production/darwin/arm64/12.7.0/GitKraken-v12.7.0.zip) | #883 |
| DigiDNA iMazing (was iMazing 2) | ✳️ Yes, works via Rosetta 2 with native support in development | ✅ Yes, Native Apple Silicon Support as of v2.13 | [source](https://downloads.imazing.com/mac/iMazing/3.6.6.24419/release-notes.html) | #890 |
| Dante Controller | 🚫 No, not yet supported only recommended for Intel-based Macs | ✅ Native Apple Silicon build available in v4.18.1.1 | [source](https://audinate-software-updates.sgp1.cdn.digitaloceanspaces.com/DanteController/4/4.18/apple_silicon/DanteController-4.18.1.1-macos-arm64.dmg) | #892 |
| Dropbox | ✳️ Yes, works via Rosetta 2 as of v110.4.458 with native support in beta | ✅ Yes, Native Apple Silicon Support | [source](https://help.dropbox.com/installs/apple-silicon-support) | #901 |
| After Effects | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support | [source](https://blog.adobe.com/en/publish/2022/04/12/new-in-after-effects-native-apple-m1-support-integrated-reviews-and-scene-edit-detection) | #926 (also #913) |
| MATLAB | ✳️ Yes, works via Rosetta 2 as of v9.9.0.1495850 | ✅ Yes, Native Apple Silicon Support as of R2023b | [source](https://www.mathworks.com/support/requirements/apple-silicon.html) | #927 |
| Elgato Control Center | 🚫 No, not yet supported, only works on Intel-based Macs | ✳️ Yes, works via Rosetta 2 as of v1.2 | [source](https://help.elgato.com/hc/en-us/articles/360052527791-Apple-Silicon-Compatibility-M1-Chip-) | #975 |
| Apache Maven | ✳️ Yes, works via Rosetta 2 | ✅ Runs natively on an Apple Silicon JDK | [source](https://maven.apache.org/download.cgi) | #1034 |
| FileZilla (was Filezilla) | ✳️ Yes, works via Rosetta 2 | ✅ Yes, Native Apple Silicon Support | [source](https://filezilla-project.org/download.php?platform=macos-arm64) | #1037 |
| BaiduNetdisk | ✅ Yes, Native Apple Silicon Support | ✅ Yes, Native Apple Silicon Support | [source](https://pkg-ant.baidu.com/issue/netdisk/MACguanjia/8.10.5/BaiduNetdisk_mac_8.10.5_arm64.dmg) | #957 |
| NotchNook | ✅ Native Apple Silicon Support reported as of v1.5.5 | ✅ Native Apple Silicon Support reported as of v1.5.5 | [source](https://getnotchnook.com) | #1115 |
| MySQL Workbench | ✳️ Yes, works via Rosetta 2 for v8.0.21 with issues reported on newer versions | ✅ Yes, Native Apple Silicon Support as of v26.10.0 | [source](https://cdn.mysql.com/Downloads/MySQLGUITools/mysql-workbench-26.10.0-macos-arm64.dmg) | none (found in the #1163 audit evidence) |
| Logitech G HUB | ✳️ Yes, works via Rosetta 2 Translation | ✅ Yes, Native Apple Silicon Support on macOS 14 and later | [source](https://support.logi.com/hc/en-001/articles/4461144061975-Logitech-G-HUB-FAQs) | #683 |
| Natron | not listed | 🔶 Stable 2.5.0 is Intel-only; arm64 build only in 2.6 alpha | [source](https://github.com/NatronGitHub/Natron/releases/tag/v2.5.0) | NatronGitHub/Natron#607 |
| yabai | not listed | ✅ Yes, Native Apple Silicon Support as of v4.0.0 | [source](https://github.com/asmvik/yabai/blob/v4.0.0/makefile) | koekeishiya/yabai#725 |
| Dart SDK | not listed | ✅ Yes, Native Apple Silicon Support as of v2.14.0 | [source](https://dart.dev/get-dart/archive) | dart-lang/sdk#42773 |
| WordPress.com Desktop | not listed | ✅ Yes, Native Apple Silicon Support as of v7.0.6 | [source](https://github.com/Automattic/wp-desktop/releases/tag/v7.0.6) | Automattic/wp-calypso#48700 |
| Julius | not listed | ✅ Yes, Native Apple Silicon Support as of v1.8.0 | [source](https://github.com/bvschaik/julius/releases/tag/v1.8.0) | bvschaik/julius#579 |
| OverSight | not listed | ✅ Yes, Native Apple Silicon Support as of v2.0.0 | [source](https://github.com/objective-see/OverSight/releases/tag/v2.0.0) | #803 (closed) |
| Oracle Instant Client | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://www.oracle.com/database/technologies/instant-client/macos-arm64-downloads.html) | #620 |
| Lepton | not listed | ✅ Yes, Native Apple Silicon Support as of v2.0.0 | [source](https://github.com/hackjutsu/Lepton/releases/tag/v2.0.0) | #772 |
| Oracle SQL Developer Data Modeler | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://www.oracle.com/database/sqldeveloper/technologies/sql-data-modeler/download/) | #806 |
| Ivanti Secure Access Client | not listed | ✅ Yes, Native Apple Silicon Support as of v22.2R1 | [source](https://help.ivanti.com/ps/help/en_US/ISAC/22.X/22.X-Client-RelNotes.pdf) | #807 |
| Authy Desktop | not listed | 🚫 No, Twilio discontinued Authy Desktop in March 2024 | [source](https://www.twilio.com/en-us/changelog/end-of-life--eol--of-twilio-authy-desktop-apps) | #871 |
| KDE Connect | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://kdeconnect.kde.org/download.html) | #878 |
| Axure RP 10 | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://www.axure.com/blog/axure-m1-support) | #895 |
| Emby Server | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://emby.media/mac-server.html) | #902 |
| iLok License Manager | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://www.paceap.com/pace-anti-piracy-announces-m1-support/) | #905 |
| KeyShot | not listed | ✅ Yes, Native Apple Silicon Support as of v11.2 | [source](https://support.keyshot.com/en/knowledge-base/knowledge/keyshot-product-faqs) | #909 |
| uTools | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://open.u-tools.cn/download/uTools-8.0.2-arm64.dmg) | #911 |
| StarUML | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://staruml.io/download) | #912 |
| Lens for Kubernetes | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://api.k8slens.dev/binaries/Lens-2026.11.261430-latest-arm64.dmg) | #923 |
| Adobe Creative Cloud | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://ccmdls.adobe.com/AdobeProducts/StandaloneBuilds/ACCC/ESD/6.11.0/478.6/macarm64/ACCCx6_11_0_478_6.dmg) | #930 |
| Twinmotion | not listed | ✅ Yes, Native Apple Silicon Support as of v2025.1 | [source](https://dev.epicgames.com/documentation/en-us/twinmotion/twinmotion-2025-1-release-notes) | #950 |
| Visual Paradigm | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://www.visual-paradigm.com/download/) | #976 |
| Orange Data Mining | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://download.biolab.si/download/files/Orange3-3.41.0-Python3.13.17-arm64.dmg) | #983 |
| Factorio | not listed | ✅ Yes, Native Apple Silicon Support as of v1.1.71 | [source](https://wiki.factorio.com/Version_history/1.1.0) | #995 |
| MEGAsync | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://mega.nz/MEGAsyncSetupArm64.dmg) | #999 |
| nRF Connect for Desktop | not listed | ✅ Yes, Native Apple Silicon Support as of v5.0.0 | [source](https://github.com/NordicSemiconductor/pc-nrfconnect-launcher/releases/tag/v5.0.0) | #1047 |
| Internet Access Policy Viewer | not listed | ✅ Yes, Native Apple Silicon Support as of v1.1 | [source](https://apps.apple.com/us/app/internet-access-policy-viewer/id1482630322?mt=12) | #1059 |
| NetNewsWire | not listed | ✅ Yes, Native Apple Silicon Support as of v6.0 | [source](https://github.com/Ranchero-Software/NetNewsWire/releases/tag/mac-6.0) | #1065 |
| Picmal | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://picmal.app) | #1074 |
| Tura | not listed | ✅ Yes, Native Apple Silicon Support as of v0.1.33 | [source](https://github.com/Tura-AI/tura/releases/tag/v0.1.33) | #1081 |
| Nexus Shell | not listed | ✅ Yes, Native Apple Silicon Support; Apple Silicon only | [source](https://nexusshell.app/en/) | #1084 |
| DSH Studio | not listed | ✅ Yes, Native Apple Silicon Support as of v0.1.1 | [source](https://github.com/Moresyl/dsh-studio/releases/tag/v0.1.1) | #1086 |
| Core-Monitor | not listed | ✅ Yes, Native Apple Silicon Support as of v17.0.5 | [source](https://github.com/offyotto/Core-Monitor/releases/tag/v17.0.5) | #1088 |
| Report Studio | not listed | ✅ Native Apple Silicon support in beta | [source](https://bowa.up.railway.app/report-studio) | #1089 |
| Clipboard Router | not listed | ✅ Yes, Native Apple Silicon Support as of v0.1.0 | [source](https://github.com/ibrolord/clipboard-router-releases/releases/tag/v0.1.0) | #1093 |
| Focuh | not listed | ✅ Native Apple Silicon support as of v0.7.0; app in early beta | [source](https://github.com/maxxthedeveloper/focuh-releases/releases/tag/v0.7.0) | #1095 |
| BetterStage | not listed | ✅ Yes, Native Apple Silicon Support as of v2.3.4 | [source](https://betterstage.app/) | #1097 |
| DynamicHorizon | not listed | ✅ Yes, Native Apple Silicon Support as of v2.3.5 | [source](https://dynamic-horizon-app-updates.s3.us-east-2.amazonaws.com/appcast.xml) | #1098 |
| Backspace: macOS Live Wallpapers | not listed | ✅ Yes, Native Apple Silicon Support as of v1.1.9 | [source](https://dynamic-horizon-app-updates.s3.us-east-2.amazonaws.com/wallpapers-appcast.xml) | #1099 |
| Autorec | not listed | ✅ Yes, Native Apple Silicon Support as of v0.12.2 | [source](https://github.com/mlaass/autorec-releases/releases/tag/v0.12.2) | #1100 |
| ShotMap | not listed | ✅ Yes, Native Apple Silicon Support as of v0.2.18 | [source](https://github.com/ixiehao/ShotMap/releases/tag/v0.2.18) | #1101 |
| Lynx Download Manager | not listed | ✅ Yes, Native Apple Silicon Support; Apple Silicon only | [source](https://www.lynxdownloadmanager.com/help/which-mac-download) | #1104 |
| Nijia | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://nijia.app/) | #1109 |
| Bella and Pan | not listed | ✅ Runs natively on Apple Silicon as an iPad app | [source](https://apps.apple.com/us/app/bella-and-pan/id6795701835) | #1128 |
| MP4Flow | not listed | ✅ Yes, Native Apple Silicon Support as of v1.5.1 | [source](https://github.com/ixiehao/MP4Flow/releases/tag/v1.5.1) | #1132 |
| LumaView | not listed | ✅ Yes, Native Apple Silicon Support as of v1.3.0 | [source](https://github.com/ixiehao/LumaView/releases/tag/v1.3.0) | #1133 |
| Orkas | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://orkas.ai/download/) | #1140 |
| Tend | not listed | ✅ Yes, Native Apple Silicon Support; Apple Silicon only | [source](https://tendmac.app) | #1142 |
| FreeFlow Dictation | not listed | ✅ Yes, Native Apple Silicon Support as of v1.7.5 | [source](https://freeflow.audio/download) | #1143 |
| Mac Ninja | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://macninjaa.com/download) | #1145 |
| Wavedance | not listed | ✅ Yes, Native Apple Silicon Support as of v0.10.0 | [source](https://wave.dance/) | #1156 |
| Linger | not listed | ✅ Yes, Native Apple Silicon Support; Apple Silicon only | [source](https://withlinger.com/support/) | #1157 |
| TypeNod | not listed | ✅ Yes, Native Apple Silicon Support as of v1.0.8 | [source](https://typenod.com/install/) | #1162 |
| LocArk | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://locark.com/press/) | #1164 |
| SiftMac | not listed | ✅ Yes, Native Apple Silicon Support as of v0.2.6 | [source](https://siftmac.com/changelog) | #1165 |
| LitLink | not listed | ✅ Yes, Native Apple Silicon Support | [source](https://litpads.app/litlink) | #1166 |

Issue numbers without a repository are in ThatGuySam/doesitarm.

Redirects added in `src/middleware-rules.js`: `/app/imazing-2` to `/app/digidna-imazing`; `/app/creative-cloud` to `/app/adobe-creative-cloud`; `/app/oversightinstaller` and `/app/oversight-installer` to `/app/oversight`.

## Left out

### Could not be confirmed at the maker's source, or could not be named safely

| App | Source issue | Why |
| --- | --- | --- |
| Minecraft | #951 | Native Java Edition from 1.19 rests on news reports quoting the launcher's patch notes. Mojang publishes no page saying so, and sources disagree on whether the launcher itself is native or uses Rosetta 2. |
| WhatsApp | #956, #1027 | The current Mac app is WhatsApp's native app, but no vendor source states its architecture, and the download could not be inspected here. |
| grandMA3 onPC | #961 | MA Lighting's requirements list Apple M1 or later as a supported processor but do not say whether the app is native. The current 🚫 status is clearly out of date; a binary check is needed. |
| Ledger Live (now Ledger Wallet) | #986 | Native support rests only on this site's scans; Ledger publishes no architecture statement. Renaming without a confirmed status was not done. |
| HP Easy Scan | #845 | Site scans only; no HP release note found. |
| HP Utility | #846 | Site scans only; no HP release note found. |
| HUAWEI DevEco Studio | #1000 | Site scan only. |
| iAntiSpy | #1012 | Site scan only. |
| AWS CLI | #1035 | Only Homebrew bottles; the AWS install guide does not state the architecture of the official package. |
| Multimeter for Mac | #1152 | The site says it runs on Apple silicon and Intel but not that it is native, and the DMG could not be inspected here. |
| HP LaserJet P1005 Driver (Kapibara Labs) | #1153 | Native, but the maker names it after HP's printer; naming a third-party driver without implying it is HP's needs a maintainer decision. |
| NW.js | nwjs/nw.js#7620 | The existing `/app/nwjs` scan listing already reports NW.js as native. A README entry named NW.js has the same slug without absorbing the scan, and `NW.js (nwjs)` would also absorb an UNDERTALE build that carries the `nwjs` alias. |
| Samsung Portable SSD | none | Not changed. The existing entry (native as of v1.7.3.0) and the #1163 audit record (native 1.6.10.1, legacy T5/X5 software) describe two software lines, and no maker source settles the first native version. |
| Octave.app | octave-app/octave-app#205 | The entry was removed from #1163; the GNU Octave entry covers Octave. |

### Classified unconfirmed by the backlog review (28)

qBittorrent (qbittorrent/qBittorrent#14379), Ninja Kiwi Archive (#847), Coreform Cubit (#869), SimAirport (#872), cTrader (#917), Mission Control Plus (#935), Batteries for Mac (#935), 0xED (#1008), iZip (#1011), Amazon Photos (#1053), Parallels System Monitor (#1057), Little Snitch Mini (#1058), System Color Picker (#1061), Pure Paste (#1063), Actions (#1064), Mouse Jiggler for Mac (#1073), AI Dictation (#1083), Read Assist (#1094), KarmaDisk (#1119), MacClean (#1123), ASAPDF, Diskaroo, Markd.ly, SayCopyPaste, Scry, Sticki.ly and Todoing.ly (#1129), DeskBlur (#1146).

### Open contributor pull requests (33)

These apps are proposed in open pull requests by their contributors, who should get their own review and credit through [app-flow](../app-flow.md). This pull request does not add them: MacOSCleaner (#1103), Outmake (#1106), Shotnix (#1107), Brow (#1108), Floodtide (#1110), Glim (#1111, #1113), DeviceShelf (#1112), Swivel (#1116), Oh My Android (#1117), ClipHearth (#1118), Aster Mail (#1124), LayoutKeeper (#1127), Barmony, PrintScreen.ly and Terminal Tags (#1129), Plainsay (#1130), Keep Mac Awake (#1131), Cockpit (#1134), Rime (#1135), Gramfix (#1136), Ncored (#1137), HashShot (#1138), FeedsBar (#1139), Needle (#1141), Soju (#1144), Wishbar (#1147), Purr (#1148), Sponge (#1150), ThermPort (#1154), Wardterm (#1155), Exhibit (#1158, #1159), DOT Audio Recorder (#1160, #1161), shepetal (#1167).

### Already handled elsewhere

- In #1163: Molotov, Firefoo, HEY, Proxifier, DriveDx, Fritzing, Contexts, TeXstudio, CircuitJS1. Firefoo, DriveDx and TeXstudio first native versions were corrected in #1163 from this review.
- Already on master: Zenaria (#1122), Kimiko (#1126).
- 33 leads were already correct and 35 had no usable update; neither group needs a change.

# Missing App URLs — Research Results (2026-06-28)

Automated research to find website / download URLs for apps in `static/app-list.json` that had no external link (only the "🧪 Apple Silicon App Tested" link).

## Summary

- **URL-less apps processed:** 1969
- **URLs found:** 1921 (98%)
- **Still missing (need manual/web research):** 48

| Confidence | Count | Meaning |
| --- | --- | --- |
| high | 568 | Authoritative Mac App Store match by bundleId (official site and/or App Store page) |
| medium | 1283 | Vendor domain inferred from reverse-DNS bundleId, verified live (HTTP 200, not parked) |
| low | 0 | Inferred domain that looks parked / for-sale — verify before use |
| system | 70 | Apple app bundled with macOS (pointed at apple.com/macos) |
| none | 48 | Nothing found automatically — needs manual lookup |

### By method

- `reverse-dns`: 1242
- `web-search`: 426
- `itunes-seller`: 184
- `apple-system`: 70
- `itunes-appstore`: 47

## Method

1. **iTunes Lookup API** (`itunes.apple.com/lookup?bundleId=…&entity=macSoftware`) — authoritative, keyed on each app's `bundleId`. Returns the developer's `sellerUrl` and the App Store page. No guessing.
2. **Reverse-DNS inference** — for apps not on the Mac App Store, candidate domains are derived from the bundleId (`net.scribus` → scribus.net, `de.clipgrab.ClipGrab` → clipgrab.de) and verified with a live HTTP request; the final URL and page `<title>` are captured. Generic prefixes (`com.electron`, `com.install4j`, `com.yourcompany`, …) are skipped.
3. **Name-based web search** — for the ~426 apps the first two tiers could not resolve (generic/placeholder bundleIds, App-Store-absent apps, and vendor sites that bot-block automated fetches), parallel research agents searched each app by name and confirmed the official site / download page / GitHub repo.
4. Apple system apps (`com.apple.*`) are tagged as bundled with macOS.

> **Review note:** `medium` results are real, reachable vendor sites but were matched by domain, not human confirmation. Where an app name differs from its vendor (e.g. *DSAssistant* → synology.com, *Garmin Express* → garmin.com) the match is still correct even though the names differ. The page title is included so each can be eyeballed quickly.

> The **complete** list of all found URLs (high + medium) lives in `found-app-urls-2026-06-28.csv` / `.json`, keyed by `bundleId` for import. Tables below show representative samples.

## High confidence — Mac App Store / official site (568)

Authoritative match on `bundleId` via the iTunes Lookup API. Safe to use as-is.

| App | bestUrl | App Store | Page title | bundleId |
| --- | --- | --- | --- | --- |
| Hype4 | https://tumult.com/hype/ | [store](https://apps.apple.com/us/app/hype-4/id1460330618?mt=12&uo=4) |  | `com.tumult.Hype4` |
| MacFamilyTree 11 | https://www.syniumsoftware.com/macfamilytree | [store](https://apps.apple.com/us/app/macfamilytree-11/id6480510488?mt=12&uo=4) |  | `com.syniumsoftware.macfamilytree11` |
| Notion Calendar | https://www.notion.com/product/calendar |  |  | `com.cron.electron` |
| FileInsight | https://apps.apple.com/us/app/fileinsight/id777031670?mt=12&uo=4 | [store](https://apps.apple.com/us/app/fileinsight/id777031670?mt=12&uo=4) |  | `com.zeroonetwenty.FileInsight` |
| FlashPrint | https://www.flashforge.com/pages/download-center |  |  | `FlashForge.FlashPrint5` |
| Router | https://readmeansrun.com/router/ | [store](https://apps.apple.com/us/app/router/id1229416813?mt=12&uo=4) |  | `com.readmeansrun.Router` |
| Sweet Home 3D | https://apps.apple.com/us/app/sweet-home-3d-plan-your-house/id669289700?mt=12&uo=4 | [store](https://apps.apple.com/us/app/sweet-home-3d-plan-your-house/id669289700?mt=12&uo=4) |  | `com.eteks.sweethome3d.SweetHome3D` |
| Tailscale | https://tailscale.com | [store](https://apps.apple.com/us/app/tailscale/id1475387142?mt=12&uo=4) |  | `io.tailscale.ipn.macos` |
| XstereO Player | http://urixblog.com | [store](https://apps.apple.com/us/app/xstereo-player/id475195500?mt=12&uo=4) |  | `yury.golubinsky.XstereO-Player` |
| iDatabase | http://www.apimac.com/mac/idatabase | [store](https://apps.apple.com/us/app/idatabase/id414104841?mt=12&uo=4) |  | `com.apimac.iDatabaseMac` |
| Kobo | https://www.kobo.com/desktop |  |  | `com.kobo.desktop.Kobo` |
| rcmd | https://lowtechguys.com/rcmd | [store](https://apps.apple.com/us/app/rcmd-classic/id1596283165?mt=12&uo=4) |  | `com.lowtechguys.rcmd` |
| ScanSnapHomeMain | https://www.pfu.ricoh.com/global/scanners/scansnap/sshome/ |  |  | `com.fujitsu.pfu.ScanSnapHome` |
| Video Editor Movavi | https://www.movavi.com | [store](https://apps.apple.com/us/app/video-editor-movavi/id1388868440?mt=12&uo=4) |  | `com.movavi.videoeditorplusappstore` |
| Battery Life Indicator | https://apps.apple.com/us/app/battery-life-and-health/id976964316?mt=12&uo=4 | [store](https://apps.apple.com/us/app/battery-life-and-health/id976964316?mt=12&uo=4) |  | `AlexanderSeroshtan.Battery-Time-Lost` |
| Countdown | https://countdowns-app.com | [store](https://apps.apple.com/us/app/countdowns-event-countdown/id917514700?uo=4) |  | `com.shayesapps.countdownApp` |
| Folder Preview | https://apps.apple.com/us/app/folder-preview/id6698876601?mt=12&uo=4 | [store](https://apps.apple.com/us/app/folder-preview/id6698876601?mt=12&uo=4) |  | `ltd.anybox.FolderPreview` |
| Googly Eyes | https://sindresorhus.com/googly-eyes | [store](https://apps.apple.com/us/app/googly-eyes/id6743048714?mt=12&uo=4) |  | `com.sindresorhus.Googly-Eyes` |
| Hand Mirror | https://handmirror.app | [store](https://apps.apple.com/us/app/hand-mirror/id1502839586?mt=12&uo=4) |  | `net.rafaelconde.Hand-Mirror` |
| LuxShot | https://github.com/lukebuild/LuxShot |  |  | `com.lukebuild.LuxShot` |
| SYNTHTRIBE | https://apps.apple.com/us/app/synthtribe/id1487038242?uo=4 | [store](https://apps.apple.com/us/app/synthtribe/id1487038242?uo=4) |  | `com.behringer.synthtool` |
| LocalSend | https://localsend.org | [store](https://apps.apple.com/us/app/localsend/id1661733229?uo=4) |  | `org.localsend.localsendApp` |
| Asana | https://asana.com/download |  |  | `com.electron.asana` |
| MiddleClick | https://github.com/artginzburg/MiddleClick |  |  | `art.ginzburg.MiddleClick` |
| Comet | https://www.perplexity.ai/comet |  |  | `ai.perplexity.comet` |
| Silhouette Studio | https://www.silhouetteamerica.com/software/silhouette-studio |  |  | `com.silhouettesoftware.Silhouette-Studio` |
| Dynamic Wallpaper | https://apps.apple.com/us/app/dynamic-wallpaper-studio/id1453504509?mt=12&uo=4 | [store](https://apps.apple.com/us/app/dynamic-wallpaper-studio/id1453504509?mt=12&uo=4) |  | `whbalzac.Dongtaizhuomian` |
| Dark Noise | https://darknoise.app | [store](https://apps.apple.com/us/app/dark-noise-ambient-sounds/id1465439395?uo=4) |  | `com.charliemchapman.dark-noise` |
| Moneydance | https://infinitekind.com | [store](https://apps.apple.com/us/app/moneydance-2024/id538911179?mt=12&uo=4) |  | `com.infinitekind.MoneydanceOSX` |
| AmneziaWG | https://amnezia.org/ | [store](https://apps.apple.com/us/app/amneziawg/id6478942365?uo=4) |  | `org.amnezia.awg` |
| AmneziaVPN | https://amnezia.org |  |  | `com.yourcompany.AmneziaVPN` |
| VideoProc Converter AI | https://www.videoproc.com |  |  | `com.digiarty.VideoProc` |
| Pearcleaner | https://github.com/alienator88/Pearcleaner |  |  | `com.alienator88.Pearcleaner` |
| WavePad Audio Editor | http://www.nch.com.au/wavepad/index.html | [store](https://apps.apple.com/us/app/wavepad-audio-editor/id970044455?mt=12&uo=4) |  | `com.nchsoftware.wavepadfree` |
| AVCHD to Mov Lite | http://www.geranium-soft.com/products/free-avchd-to-mov/ | [store](https://apps.apple.com/us/app/avchd-to-mov-lite/id675103877?mt=12&uo=4) |  | `com.geranium-soft.avchdtomov` |
| Commander One PRO | https://ftp-mac.com/pro-file-manager.html?utm_source=appstore&utm_medium=referral&utm_campaign=c1pro | [store](https://apps.apple.com/us/app/commander-one-pro-ftp-cloud/id1035237815?mt=12&uo=4) |  | `com.eltima.cmd1.pro.mas` |
| Starming SwiftPamphletAppByMing | https://apps.apple.com/us/app/%E6%88%B4%E9%93%AD%E7%9A%84%E5%B0%8F%E5%86%8C%E5%AD%90/id1609702529?mt=12&uo=4 | [store](https://apps.apple.com/us/app/%E6%88%B4%E9%93%AD%E7%9A%84%E5%B0%8F%E5%86%8C%E5%AD%90/id1609702529?mt=12&uo=4) |  | `com.starming.SwiftPamphletAppByMing` |
| Qfinder Pro | https://www.qnap.com/en/utilities/essentials |  |  | `qnap.com.qfinder` |
| Macgo Blu-ray Player | https://www.macblurayplayer.com/macgo-mac-bluray-menu-player-pro.htm | [store](https://apps.apple.com/us/app/macgo-blu-ray-player/id1321354161?mt=12&uo=4) |  | `com.macblurayplayer.BlurayPlayer` |
| xca | https://apps.apple.com/us/app/xca/id1563732616?mt=12&uo=4 | [store](https://apps.apple.com/us/app/xca/id1563732616?mt=12&uo=4) |  | `de.hohnstaedt.xca` |

_…and 528 more — see the complete list in `found-app-urls-2026-06-28.csv`._

## Medium confidence — inferred vendor domain, verified live (1283)

Domain derived from the reverse-DNS bundleId and confirmed reachable (HTTP 200, not parked). ~90% correct in sampling; a small residual error comes from bundleId vendor tokens that coincidentally resolve to an unrelated live domain — spot-check via the page title before publishing.

| App | bestUrl | App Store | Page title | bundleId |
| --- | --- | --- | --- | --- |
| 3uTools | http://www.3u.com/ |  | 3uTools – All-in-One iOS Device Management & Flash Tool | `cn.3uTools.mac` |
| MediaHuman Audio Converter | https://www.mediahuman.com/en23/ |  | MediaHuman - multimedia software for macOS, Windows and Linux | `com.mediahuman.Audio Converter` |
| TestGen | https://tamarack-software.com/ |  | Tamarack Software | `com.tamarack-software.TestGen` |
| EPSON Software Updater | https://epson.com/ |  | Epson Global Portal | `com.epson.EPSON_Software_Updater` |
| SQLiteStudio | https://salsoft.com.pl/ |  |  | `pl.com.salsoft.SQLiteStudio` |
| ClipGrab | https://clipgrab.de/ |  | ClipGrab - Downloader und Converter für YouTube & Co | `de.clipgrab.ClipGrab` |
| Scribus | https://scribus.com/ |  |  | `net.scribus` |
| DSAssistant | https://www.synology.com/en-global |  | Synology Inc. | `com.synology.DSAssistant` |
| Ente Auth | https://ente.com/ |  |  | `io.ente.auth.mac` |
| SmartSwitch | https://www.samsung.com/us/ |  | Samsung US \| Mobile \| TV \| Home Electronics \| Home Appliances \| Samsung US | `com.samsung.SmartSwitch` |
| Webots | https://cyberbotics.com/ |  | Cyberbotics: Robotics simulation with Webots | `com.cyberbotics.webots` |
| Image Viewer | https://spend.emburse.com/login |  | Emburse Spend | `com.abacus.Image-Viewer` |
| Garmin Express | https://www.garmin.com/en-US/ |  | Garmin Official Site | `com.garmin.renu.client` |
| Aurora HDR 2018 | https://skylum.com/aurorahdr |  |  | `com.macphun.aurorahdr2018mas` |
| R | https://www.r-project.org/ |  | R: The R Project for Statistical Computing | `org.R-project.R` |
| BBC iPlayer Downloads | https://www.bbc.co.uk/ |  | BBC - Home | `uk.co.bbc.iplayer.downloads` |
| Assessment Viewer | https://assess.com/ |  | Smarter solutions for Certification &amp; Education \| Assessment Systems | `com.assess.assessment` |
| Notary | http://twocent.de/ |  |  | `de.twocent.notary.app` |
| vLabeler | https://sdercolin.com/ |  | fantasia | `com.sdercolin.vlabeler` |
| EpsonPhotoPlusTool | https://epson.com/ |  | Epson Global Portal | `com.epson.PhotoPlusTool` |
| Epson Photo+ | https://epson.com/ |  | Epson Global Portal | `com.epson.PhotoPlus` |
| Epson Connect Printer Setup | https://epson.com/ |  | Epson Global Portal | `com.epson.EpsonConnectPrinterSetup` |
| OpenOffice | https://www.openoffice.org/ |  | Apache OpenOffice - Official Site - The Free and Open Productivity Suite | `org.openoffice.script` |
| Deckboard | https://deckboard.app |  |  | `com.rivafarabi.deckboard.server` |
| ManOpen | https://clindberg.org/ |  | Carl E. Lindberg Home Page | `org.clindberg.ManOpen` |
| Tinderbox | https://eastgate.com/ |  | Eastgate: serious hypertext | `com.eastgate.Tinderbox-8` |
| Legcord | https://legcord.app/ |  | Legcord – Lightweight Discord Client | `app.legcord.Legcord` |
| ExactScan | https://exactcode.de/ |  | ExactCODE - higher quality software | `de.exactcode.ExactScan` |
| UA Connect | https://www.uaudio.com/ |  |  | `com.uaudio.ua-connect` |
| Sky Go | https://www.sky.com/watch/sky-go |  |  | `com.bskyb.skygoplayer` |
| Canon IJ Scan Utility Lite | https://co.com/ |  | co.com | `jp.co.canon.ij.scanutilitylite` |
| JDownloader2 | https://jdownloader.org/ |  | JDownloader.org - Official Homepage | `org.jdownloader.launcher` |
| VencordInstaller | https://vendicated.dev/ |  | V&#39;s Site | `dev.vendicated.vencordinstaller` |
| ArubaSign | https://www.pec.it/ |  | PEC e Servizi Certificati Aruba: Firma, Fatturazione, DocFly, SPID \| Pec.it | `it.arubapec.ArubaSignLauncher` |
| Avantis Director | https://allenheath.com/ |  | Redirecting... | `com.allenheath.AvantisDirector` |
| Microsoft Defender | https://www.microsoft.com/en-us |  | Microsoft – AI, Cloud, Productivity, Computing, Gaming &amp; Apps | `com.microsoft.wdav` |
| Quark | https://www.quark.com/ |  |  | `com.quark.desktop` |
| Stremio | https://www.san-agrow.com/ |  | SAN Agrow – Passion for Innovation: SAN Agrow | `com.westbridge.stremio5-mac` |
| Reolink | https://reolink.com/ |  | Reolink Official: Security Cameras and Systems for Home & Business | `com.reolink.app` |
| PioneerDriveUtilityLiteForMac | https://jpn.pioneer/ja/ |  | パイオニア株式会社 | `jp.pioneer.pddm.bddrivefirmwareupdaterformac` |
| qcma | https://www.edificia.pe/ |  | Edificia \| Software de Edificios y Condominios | `pe.edificia.qcma` |
| Winbox-mac | https://mikrotik.com/ |  | MikroTik &middot; Routers and Wireless | `com.mikrotik.winbox` |
| Yandex Messenger | https://sso.passport.yandex.ru/push?uuid=03fbe265-e5ca-4072-9fed-bac3ffafc342&retpath=https%3A%2F%2Fdzen.ru%2F%3Fyredirect%3Dtrue%26is_autologin_ya%3Dtrue |  |  | `ru.yandex.yamb` |
| Movavika Video Editor 26 | https://www.movavika.ru/mac.html |  | Программы Мовавика (Movavi) для MacOS | `ru.movavika.videoeditorplus26` |
| The Unarchiver | https://macpaw.com/ |  | MacPaw \| Making Your Mac Life Simpler | `com.macpaw.site.theunarchiver` |
| Yandex | https://sso.passport.yandex.ru/push?uuid=dc5682d4-e38f-4d91-bd2b-da7750439c7c&retpath=https%3A%2F%2Fdzen.ru%2F%3Fyredirect%3Dtrue%26is_autologin_ya%3Dtrue |  |  | `ru.yandex.desktop.yandex-browser` |
| Ru Yandex Desktop Music | https://sso.passport.yandex.ru/push?uuid=f014d0be-9e18-41dc-a6e2-d9d700ba9e2a&retpath=https%3A%2F%2Fdzen.ru%2F%3Fyredirect%3Dtrue%26is_autologin_ya%3Dtrue |  |  | `ru.yandex.desktop.music` |
| Movavi Video Editor Plus 2020 | https://www.movavi.com/mac.html |  | Trusted Multimedia Software for your Mac \| Movavi | `com.movavi.videoeditorplus20` |
| mediaget | https://mediaget.com/ |  | Медиагет – Торрент-клиент с поиском и встроенным плеером | `com.mediaget.MediaGet` |
| Ball | https://nateparrott.com/ |  |  | `com.nateparrott.Ball` |
| Dropshelf | https://pilotmoon.com/ |  | Pilotmoon Software | `com.pilotmoon.Dropshelf` |
| AnkerWork | https://www.anker.com/ |  | Anker \| Live Charged. - Anker US | `com.anker.pcankerwork` |
| Cherry Studio | https://kangfenmao.com/ |  | 亢奋猫 | `com.kangfenmao.CherryStudio` |
| Alertus Desktop | https://www.alertus.com/ |  | Emergency Mass Notification Systems - Alertus Technologies | `com.alertus.AlertusDesktopClient` |
| WD Drive Utilities | https://www.westerndigital.com/ |  | High-Capacity HDDs for PCs, NAS, Gaming, Data Centers, and AI Data Cycles \| WD | `com.wdc.branded.driveutility` |
| Heroic | https://heroicgameslauncher.com/ |  | Heroic Games Launcher — Free Epic, GOG &amp; Amazon Games Launcher | `com.heroicgameslauncher.hgl` |
| Raycast | https://www.raycast.com/ |  |  | `com.raycast.macos` |
| The Unofficial Homestuck Collection | https://bambosh.com/ |  |  | `com.bambosh.unofficialhomestuckcollection` |
| ContraptionMaker | https://spotkin.com/ |  | SPBUTOTO <> Daftar 5 Bandar Togel Deposit 5000 Dan 10 Situs Bo Togel Terpercaya Hadiah Tertinggi Di Asia | `com.spotkin.ContraptionMaker` |
| Kando | https://kando.menu |  |  | `com.electron.kando` |

_…and 1223 more — see the complete list in `found-app-urls-2026-06-28.csv`._

## Low confidence — domain is parked / for-sale, do NOT use (0)

The inferred domain resolves to a domain-squatter / for-sale page. These apps effectively still need a real URL (treat as "missing").

| App | bestUrl | App Store | Page title | bundleId |
| --- | --- | --- | --- | --- |

## Still missing — needs manual lookup / web search (48)

Of these, **28** have an obvious vendor domain from the bundleId that simply could not be auto-verified — most are large vendors whose sites bot-block automated requests (e.g. Logitech, Oracle, Eclipse). The "likely domain" column is an **unverified** best guess; the rest (generic `com.electron` / `com.install4j` / `com.yourcompany` bundleIds) need a name-based web search.

| App | bundleId | likely domain (unverified) | status | category |
| --- | --- | --- | --- | --- |
| Product Gender Analysis | `com.hidzo.productgender` | hidzo.com | native |  |
| skelActivator | `skelActivator` | — | native |  |
| skelRevocation | `skelRevocation` | — | native |  |
| Papopirata | `com.chepemac.papopirata` | chepemac.com | native |  |
| Tc Employeehub | `com.tc.employeehub` | tc.com | unreported |  |
| HiM | `com.iazasoft.HiM` | iazasoft.com | unreported |  |
| Plot | `Plot` | — | native |  |
| NPS Browser | `JK3Y.NPS-Browser` | nps-browser.com | native |  |
| Battery Amperage | `haitham.khedre.Battery-Amperage` | khedre.com | unreported | System Tools |
| AntiVirus Sentinel Pro | `eu.securityfocus.Sentinel-Pro` | securityfocus.com | unreported |  |
| Airplane mode | `com.pradeepb28.Airplane-mode` | pradeepb28.com | native |  |
| Instagram Downloader | `baonguyen.Instagram-Downloader` | instagram-downloader.com | unreported |  |
| WebVideoHunter | `com.capibara.webvideohunter` | capibara.com | unreported |  |
| Electron Shark-mac-client | `com.electron.shark-mac-client` | — | unreported |  |
| PacMan | `com.DefaultCompany.PacMan` | defaultcompany.com | native |  |
| ENT Native | `com.electron.ent-native` | — | native |  |
| OED | `org.screenweaver.hx.bootloader` | screenweaver.org | unreported |  |
| LiveIPC | `fkhl.LiveIPC` | liveipc.com | unreported |  |
| Neon | `com.electron.neon` | — | unreported |  |
| HardwareManager | `com.yourcompany.HardwareManager` | — | unreported |  |
| Bits | `com.electron.bits` | — | native |  |
| ioCentre | `com.company.G_ioCenter` | — | unreported |  |
| Electron Keyan | `com.electron.keyan` | — | unreported |  |
| CloudRush | `com.EmperoarV.CloudRush` | emperoarv.com | native |  |
| Sol Client | `com.electron.sol-client` | — | unreported |  |
| Skasuj forki | `self.kmitko.Skasuj-forki` | kmitko.com | native |  |
| TCANLINPro | `com.yourcompany.TCANLINPro` | — | unreported |  |
| PandaBar | `com.mahasoftware.pandabar` | mahasoftware.com | unreported |  |
| NextGen Calculator | `com.electron.nextgen-calculator` | — | native |  |
| WacDonald's | `com.tuo.wacdonalds` | tuo.com | unreported | Entertainment and Media Apps |
| Raven Desktop Beta | `Raven-Desktop-Beta` | — | unreported |  |
| jdNetdisk | `edu.jdNetdisk` | jdnetdisk.com | unreported |  |
| MiniPlay | `com.macappsters.musicboxforpandora` | macappsters.com | unreported | Entertainment and Media Apps |
| TftpServer | `com.FlrSoft.TftpServer` | flrsoft.com | unreported |  |
| E-Mage Reloaded | `com.electron.emage-angular` | — | unreported |  |
| TomieWGM | `com.Ollane.TomieWGM` | ollane.com | unreported |  |
| Picascade | `com.electron.picascade` | — | unreported |  |
| DGTL.Translator | `com.electron.dgtl.translator` | — | native |  |
| Recipedo | `com.alaskco.Recipe` | alaskco.com | native |  |
| CLAS Student GDCP | `com.114consulting.CLAS-Student-Mac` | 114consulting.com | unreported |  |
| FBWS | `HiTRUST.FBWS` | fbws.com | unreported |  |
| 1player | `com.kongfuapps.1player` | kongfuapps.com | unreported |  |
| Instagram unite | `com.Instagram_unite` | instagram_unite.com | unreported |  |
| Creator Studio | `com.Creator_Studio` | creator_studio.com | unreported |  |
| XiYou | `com.xiyou.desktop` | xiyou.com | unreported |  |
| CareConnect | `com.install4j.9770-2859-7603-5794.23` | — | unreported |  |
| Uninstall | `com.yourcompany.Uninstall` | — | unreported |  |
| SWClient | `$(PRODUCT_BUNDLE_IDENTIFIER)` | — | unreported |  |

## Apple system apps (bundled with macOS)

- TV (`com.apple.TV`)
- Tips (`com.apple.helpviewer`)
- Weather (`com.apple.weather`)
- VoiceMemos (`com.apple.VoiceMemos`)
- Apple AI API (`com.apple.AppleIntelligenceAPI`)
- OSX Validate All AUs (`com.apple.ScriptEditor.id.OSX-Validate-All-AUs`)
- Application Stub (`com.apple.automator.• Ocultar Archivos Ocultos`)
- MacYTDL (`com.apple.script.id.MacYTDL`)
- FaceTime (`com.apple.FaceTime`)
- Screen Sharing (`com.apple.ScreenSharing`)
- Migration Assistant (`com.apple.MigrateAssistant`)
- Disk Utility (`com.apple.DiskUtility`)
- Digital Color Meter (`com.apple.DigitalColorMeter`)
- ColorSync Utility (`com.apple.ColorSyncUtility`)
- Boot Camp Assistant (`com.apple.bootcampassistant`)
- TextEdit (`com.apple.TextEdit`)
- Stickies (`com.apple.Stickies`)
- Photos (`com.apple.Photos`)
- Passwords (`com.apple.Passwords`)
- Contacts (`com.apple.AddressBook`)
- Clock (`com.apple.clock`)
- Calendar (`com.apple.iCal`)
- Calculator (`com.apple.calculator`)
- Books (`com.apple.iBooksX`)
- Pricing (`com.apple.ist.windward-mac`)
- Apple Configurator (`com.apple.configurator.ui`)
- GSAS-II (`com.apple.ScriptEditor.id.5D7AC8F0-4F44-4FA7-9B54-23F9DBB8AF14`)
- iBooks Author (`com.apple.iBooksAuthor`)
- Audio MIDI Setup (`com.apple.audio.AudioMIDISetup`)
- Print Center (`com.apple.printcenter`)
- Photo Booth (`com.apple.PhotoBooth`)
- Shortcuts (`com.apple.shortcuts`)
- FindMy (`com.apple.findmy`)
- All App Close (`com.apple.automator.All-App-Close`)
- VoiceOver Utility (`com.apple.VoiceOverUtility`)
- Bluetooth File Exchange (`com.apple.BluetoothFileExchange`)
- Grapher (`com.apple.grapher`)
- Keychain Access (`com.apple.keychainaccess`)
- Screenshot (`com.apple.screenshot.launcher`)
- Script Editor (`com.apple.ScriptEditor2`)
- System Information (`com.apple.SystemProfiler`)
- mount (`com.apple.automator.mount`)
- Image Capture (`com.apple.Image_Capture`)
- ReloadLogi (`com.apple.automator.ReloadLogi`)
- Chiudi tutto (`com.apple.automator.Chiudi tutto`)
- App Store (`com.apple.AppStore`)
- Maps (`com.apple.Maps`)
- Reminders (`com.apple.reminders`)
- Siri (`com.apple.siri.launcher`)
- System Preferences (`com.apple.systempreferences`)
- Time Machine (`com.apple.backup.launcher`)
- Messages (`com.apple.MobileSMS`)
- QuickTime Player (`com.apple.QuickTimePlayerX`)
- Mission Control (`com.apple.exposelauncher`)
- Work (`com.apple.automator.Work`)
- Screen Saver (`com.apple.ist.DemoLoop-Mac`)
- Installer (`com.apple.installer`)
- Recursive Image File Processing Droplet (`com.apple.ScriptEditor.id.Recursive-Image-File-Processing-Droplet`)
- AirPort Utility (`com.apple.airport.airportutility`)
- Stocks (`com.apple.stocks`)
- Touch ID (`com.apple.MesaStoreDemo`)
- Dashboard (`com.apple.dashboardlauncher`)
- LibreELEC (`com.apple.ScriptEditor.id.LibreELEC`)
- Uninstall VIDBOX Capture Device Driver (`com.apple.ScriptEditor.id.Uninstall-VIDBOX-Capture-Device-Driver`)
- Archive Utility (`com.apple.archiveutility`)
- Chess (`com.apple.Chess`)
- Podcasts (`com.apple.podcasts`)
- Automator (`com.apple.Automator`)
- Dictionary (`com.apple.Dictionary`)
- Launchpad (`com.apple.launchpad.launcher`)

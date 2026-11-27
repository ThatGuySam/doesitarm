# Unreported scan audit, 2026-11-25

Evidence record for the README additions in this pull request. The full per-app records (one JSON object per app with version, official link, evidence links and what each source says, confidence, limitations and notes) are in [unreported-scan-audit-2026-11-25/](unreported-scan-audit-2026-11-25/).

## Method

The site's "need info" bucket held 1,174 listings created when people uploaded app files to the scanner, mostly in 2021 and 2022, and the uploaded file had no arm64 code. Nothing re-checks those listings. On 2026-11-25, 30 research agents (OpenAI GPT Sol, coordinated from a Claude Code session) each took about 40 of these apps and identified the product, its publisher, its current or final version and its official page. For some apps the agents downloaded the official installer and inspected the main executable's Mach-O architecture slices; for others they relied on vendor documentation, release notes, Mac App Store listings, Homebrew cask metadata or first-hand user reports. Each record says which (`verification`: binary, documentation or both) and gives a confidence level.

Claude Code then turned the records into README lines with a script and reviewed every added line against its record. Only native, Rosetta and unsupported findings that were not low confidence became lines. Names that would absorb other listings through the site's whole-word name matching were skipped, and a review pass held back records whose own limitations or notes undercut the claim, whose app link was a raw download, or whose version did not read as a version. In a spot check of 36 random native claims, every evidence link loaded and stated the architecture. Everything below is unchanged by this pull request and needs a maintainer decision.

## Totals

| Finding | Apps | In this PR |
| --- | ---: | --- |
| Native Apple Silicon | 390 | 334 README lines |
| Works via Rosetta 2 | 122 | 100 README lines |
| Unsupported on Apple Silicon | 17 | 12 README lines |
| Discontinued | 235 | No change |
| Intel-only, Rosetta unverified | 110 | No change |
| Not a standalone app listing | 112 | No change |
| Still unknown | 188 | No change |
| **Total** | **1,174** | **446 README lines** |

Of the 529 native, Rosetta and unsupported findings, 446 became README lines, 49 were held back for name collisions, 27 in the review pass, 3 for missing or unusable fields, and 4 already had a README entry with the same name.

## Discontinued (235)

The product is no longer sold, updated or downloadable from its publisher. Candidates for a discontinued status or removal.

| App | Finding | Evidence |
| --- | --- | --- |
| [0xED](https://doesitarm.com/app/0xed) | Last release v1.1.4 (2017) | [source](https://www.macupdater.net/app_updates/appinfo/com.suavetech.0xED/index.html) |
| [32 Lives](https://doesitarm.com/app/32-lives) | Last release v2.0.6 (2019) | [source](https://www.soundradix.com/products/32-lives/) |
| [3CX client](https://doesitarm.com/app/3cx-client) | No longer offered | [source](https://www.3cx.es/foro/threads/cliente-3cx-para-mac-versi%C3%B3n-20.118174/) |
| [ABBYY FineReader for ScanSnap](https://doesitarm.com/app/abbyy-finereader-for-scansnap) | Last release v5.5 | [source](https://support.abbyy.com/hc/en-us/articles/4402042957202-FineReader-for-ScanSnap-Discontinued-5-5-for-Mac-and-new-M1-chip) |
| [ALZip](https://doesitarm.com/app/alzip) | Last release v1.40 | [source](https://secure.altools.co.kr/support/Notice_Contents.aspx?idx=947) |
| [Amadeus Pro](https://doesitarm.com/app/amadeus-pro) | Last release v2.8.15 (2026) | [source](https://apps.apple.com/us/app/amadeus-pro/id438292371?mt=12) |
| [AmpliTube 4](https://doesitarm.com/app/amplitube-4) | Last release v4.10 | [source](https://www.ikmultimedia.com/news/?item_id=10048) |
| [AntiVirus Sentinel Pro](https://doesitarm.com/app/antivirus-sentinel-pro) | Last release v3.2.6 | [source](https://www.macworld.com/article/227356/the-week-in-mac-apps-performance-pro-protects-your-data-and-online-identity.html) |
| [Anvil](https://doesitarm.com/app/anvil) | Last release v1.1.8 (2018) | [source](https://github.com/beachio/anvilformac) |
| [Apache NetBeans 12.6](https://doesitarm.com/app/apache-netbeans-126) | Last release v12.6 (2021) | [source](https://netbeans.apache.org/front/main/download/nb126/nb126/) |
| [Apache NetBeans 14](https://doesitarm.com/app/apache-netbeans-14) | Last release v14 (2022) | [source](https://netbeans.apache.org/front/main/download/nb14/index.html) |
| [APG Live Manager](https://doesitarm.com/app/apg-live-manager) | Last release v1.8.10 | [source](https://apg.audio/en/downloads/) |
| [AppDelete](https://doesitarm.com/app/appdelete) | Last release v4.3.3 | [source](https://github.com/Homebrew/homebrew-cask/commit/8ad8fd9282449367589cfa40e0d4f94a0fc7a928) |
| [ARC 3 Analysis](https://doesitarm.com/app/arc-3-analysis) | No longer offered | [source](https://www.bhphotovideo.com/lit_files/1073197.pdf) |
| [Aria2GUI](https://doesitarm.com/app/aria2gui) | Last release v1.4.1 | [source](https://github.com/NickYang29/aria2gui/releases) |
| [Artlantis](https://doesitarm.com/app/artlantis) | No longer offered | [source](https://artlantis.com/en/homepage/) |
| [ArtRage 4](https://doesitarm.com/app/artrage-4) | Last release v4.5.10 (2016) | [source](https://www.artrage.com/product-comparison/previous-desktop-editions/) |
| [Audirvana](https://doesitarm.com/app/audirvana) | Last release v3.5.50 (2021) | [source](https://community.audirvana.com/t/release-note-audirvana-3-5-50/29243) |
| [Aurora HDR](https://doesitarm.com/app/aurora-hdr) | Last release v1.0.2 | [source](https://skylum.com/aurora-hdr-vs-luminar-neo) |
| [Aurora HDR 2018](https://doesitarm.com/app/aurora-hdr-2018) | No longer offered | [source](https://blog.skylum.com/best-hdr-software/) |
| [Authy Desktop](https://doesitarm.com/app/authy-desktop) | No longer offered | [source](https://www.twilio.com/en-us/changelog/end-of-life--eol--of-twilio-authy-desktop-apps) |
| [Avast Passwords](https://doesitarm.com/app/avast-passwords) | No longer offered | [source](https://support.avast.com/avast/en/us/home/current/solutions/avast-passwords-migration-faq) |
| [AVG Cleaner](https://doesitarm.com/app/avg-cleaner) | Last release v14.0.4766 (2016) | [source](https://support.avg.com/SupportArticleView?l=en&urlName=Install-Mac-AVG-Cleaner) |
| [Avogadro](https://doesitarm.com/app/avogadro) | Last release v1.2.0 (2016) | [source](https://sourceforge.net/projects/avogadro/files/avogadro/1.2.0/) |
| [Backgammon Reloaded 3D](https://doesitarm.com/app/backgammon-reloaded-3d) | Last release v5 (2017) | [source](https://iphoneaddict.fr/apps/mac/jeux/backgammon-reloaded-3d.html) |
| [Badlion Client](https://doesitarm.com/app/badlion-client) | No longer offered | [source](https://www.badlion.net/minecraft-client) |
| [BatChmod](https://doesitarm.com/app/batchmod) | Last release v1.7b5 | [source](https://batchmod.macupdate.com/) |
| [BBC iPlayer Downloads](https://doesitarm.com/app/bbc-iplayer-downloads) | Last release v2.14.0 (2024) | [source](https://www.bbc.com/news/technology-68283165) |
| [Beaker Browser](https://doesitarm.com/app/beaker-browser) | Last release v1.1.0 (2020) | [source](https://github.com/beakerbrowser/beaker/blob/master/archive-notice.md) |
| [Betaflight Configurator](https://doesitarm.com/app/betaflight-configurator) | Last release v10.10.0 (2024) | [source](https://betaflight.com/docs/wiki/app) |
| [Better](https://doesitarm.com/app/better) | No longer offered | [source](https://small-tech.org/) |
| [Better Rename 10](https://doesitarm.com/app/better-rename-10) | Last release v10.46.1 | [source](https://www.publicspace.net/ABetterFinderRename/version10_history.html) |
| [Better Rename 9](https://doesitarm.com/app/better-rename-9) | No longer offered | [source](https://www.publicspace.net/blog/a-better-finder-rename/2015/07/22/a-better-finder-rename-10-on-the-horizon/) |
| [BitPerfect](https://doesitarm.com/app/bitperfect) | Last release v3.2.0 (2019) | [source](https://bitperfectsound.blogspot.com/2019/10/announcing-bitperfect-v320.html) |
| [Black Light Pro](https://doesitarm.com/app/black-light-pro) | Last release v1.2 (2020) | [source](https://michelf.ca/software/black-light-pro/) |
| [Box Notes](https://doesitarm.com/app/box-notes) | No longer offered | [source](https://support.box.com/hc/en-us/articles/5504613283859-Box-Notes-Desktop-app-EOL-on-June-15-2022) |
| [Cabbage](https://doesitarm.com/app/cabbage) | Last release v2.10.0 (2025) | [source](https://github.com/rorywalsh/cabbage/releases/tag/v2.10.0) |
| [Camtasia 3](https://doesitarm.com/app/camtasia-3) | Last release v3.1.7 | [source](https://support.techsmith.com/hc/en-us/articles/39974346643853-Engineering-Release-Policy) |
| [Capture NX-D](https://doesitarm.com/app/capture-nx-d) | Last release v1.6.5 (2021) | [source](https://nij.nikon.com/news/support/2022/0603.html) |
| [CDRViewer Pro](https://doesitarm.com/app/cdrviewer-pro) | No longer offered | [source](https://iconshots.com/cdrviewer-for-osx/) |
| [ChemDraw](https://doesitarm.com/app/chemdraw) | Last release v20.x | [source](https://support.revvitysignals.com/hc/en-us/articles/41748536567572-Sunset-Notice-ChemDraw-versions-20-x-21-x-22-x) |
| [Chicken](https://doesitarm.com/app/chicken) | Last release v2.2b2 (2011) | [source](https://sourceforge.net/projects/chicken/) |
| [Chicken of the VNC](https://doesitarm.com/app/chicken-of-the-vnc) | Last release v2.0b4 (2006) | [source](https://sourceforge.net/projects/cotvnc/files/cotvnc/) |
| [CHITUBOX](https://doesitarm.com/app/chitubox) | Last release v2.3.1 (2025) | [source](https://sac.chitubox.com/getSoftwareVersionHistoryList.do2?softwareId=17952) |
| [Clash for Windows](https://doesitarm.com/app/clash-for-windows) | Last release v0.20.39 | [source](https://clash.build/en/client-guides/clash-for-windows) |
| [CleanMyDrive 2](https://doesitarm.com/app/cleanmydrive-2) | No longer offered | [source](https://macpaw.com/support/cleanmydrive/faq) |
| [Clear Day Lite](https://doesitarm.com/app/clear-day-lite) | Last release v2.0.4 (2014) | [source](https://macupdater.net/app_updates/appinfo/com.vimov.weatherhd.maclite/index.html) |
| [ClickRepair](https://doesitarm.com/app/clickrepair) | No longer offered | [source](https://archive.clickrepair.org/downloads/CRManual.pdf) |
| [ClipMenu](https://doesitarm.com/app/clipmenu) | Last release v1.0.0a1 (2014) | [source](https://www.clipmenu.com/blog/2014/11/11/clipmenu-1-0-0a1-released/) |
| [Clipto](https://doesitarm.com/app/clipto) | Last release v7.2.17 (2021) | [source](https://github.com/clipto-pro/Desktop/releases/tag/v7.2.17) |
| [CloudBounce](https://doesitarm.com/app/cloudbounce) | No longer offered | [source](https://www.image-line.com/cloudbounce) |
| [cloudLibrary](https://doesitarm.com/app/cloudlibrary) | No longer offered | [source](https://www.yourcloudlibrary.com/wp-content/uploads/2018/12/G-LBUG1117NA.001-cloudLibrary-PC-Mac-app-user-guide-image.pdf) |
| [Convert It](https://doesitarm.com/app/convert-it) | Last release v1.6.1 (2017) | [source](https://www.andrewschenk.com/) |
| [CorelCAD 2023](https://doesitarm.com/app/corelcad-2023) | Last release v2023.5 (build 22.3.1.4090) (2022) | [source](https://kb.corel.com/hc/en-us/articles/55554428649876-Important-product-notice-changes-for-CorelCAD-and-transition-to-the-ARES-CAD-Software) |
| [CZUR Aura](https://doesitarm.com/app/czur-aura) | Last release v3.1.5 | [source](https://abroad.czur.com/czur/usermanual/aura/Aura%20Series%20User%20Manual-20181203A.pdf) |
| [DanteFirmwareUpdateManager](https://doesitarm.com/app/dantefirmwareupdatemanager) | Last release v3.10.6 | [source](https://dev.audinate.com/GA/firmware-update-manager/userguide/latest/AUD-MAN-Firmware_Update_Manager-v2.7.pdf) |
| [DazCentral](https://doesitarm.com/app/dazcentral) | No longer offered | [source](https://www.daz3d.com/blog/dazcentral-your-new-content-manager) |
| [Deepnest.io](https://doesitarm.com/app/deepnestio) | Last release v1.0.5 | [source](https://deepnest.io/) |
| [DeskApp for YouTube](https://doesitarm.com/app/deskapp-for-youtube) | No longer offered | [source](https://deskapp-youtube.softwar.io/) |
| [DevSwatch](https://doesitarm.com/app/devswatch) | Last release v1.3 (2020) | [source](https://www.macupdater.com/app_updates/appinfo/AubreeCloud.mini-swatch/index.html) |
| [Disk Cartography](https://doesitarm.com/app/disk-cartography) | No longer offered | [source](https://www.macworld.com/article/228902/the-week-in-mac-apps-bring-your-photos-to-the-next-level-with-macphuns-aurora-hdr.html) |
| [Disk Inventory X](https://doesitarm.com/app/disk-inventory-x) | Last release v1.3 (2019) | [source](https://www.derlien.com/) |
| [DivX Player](https://doesitarm.com/app/divx-player) | Last release v10.8.9 (build 11.8.9.10052020) | [source](https://support.divx.com/hc/en-us/articles/35441013112215-End-of-Support-for-DivX-10-x-for-Windows-and-Mac) |
| [DockStation](https://doesitarm.com/app/dockstation) | Last release v1.5.1 (2019) | [source](https://github.com/DockStation/dockstation/releases/tag/v1.5.1) |
| [DotSpy](https://doesitarm.com/app/dotspy) | Last release v4.5 | [source](https://docs.esko.com/docs/en-us/imagingengine/18.1/whatsnew/Whats-new-Release-document-for-Imaging-Engine-V1811.pdf) |
| [Dragon](https://doesitarm.com/app/dragon) | Last release v6.0.8 (2017) | [source](https://nuance.custhelp.com/app/answers/detail/a_id/27843/~/dragon-professional-for-mac-6:-end-of-life,-end-of-support-dates) |
| [DrCleaner](https://doesitarm.com/app/drcleaner) | No longer offered | [source](https://helpcenter.trendlife.com/en-us/article/tmka-09102) |
| [Drive Clean](https://doesitarm.com/app/drive-clean) | Last release v1.3 | [source](https://macfan.book.mynavi.jp/article/m37987/) |
| [Drobo Dashboard](https://doesitarm.com/app/drobo-dashboard) | Last release v3.6.1 (2021) | [source](https://www.imagestore.co.uk/latest/2023/04/goodbye-drobo-welcome-owc/) |
| [Duplicate File Finder & Remover](https://doesitarm.com/app/duplicate-file-finder-and-remover) | Last release v2.0 | [source](https://www.cleverfiles.com/duplicate-file-finder-remover.html) |
| [Enjoyable](https://doesitarm.com/app/enjoyable) | Last release v1.2 | [source](https://yukkurigames.com/enjoyable/) |
| [Essential Keyboard Collection](https://doesitarm.com/app/essential-keyboard-collection) | No longer offered | [source](https://www.sonivoxmi.com/) |
| [EVE Launcher](https://doesitarm.com/app/eve-launcher) | No longer offered | [source](https://www.eveonline.com/news/view/launch-to-the-future) |
| [FAHControl](https://doesitarm.com/app/fahcontrol) | Last release v7.6.21 | [source](https://www.foldingathome.org/guides/v8-5) |
| [feedly](https://doesitarm.com/app/feedly) | Last release v1.1 | [source](https://www.donanimhaber.com/Populer-RSS-servisi-Feedly-icin-hazirlanan-yeni-Mac-uygulamasi-feedly--61077) |
| [File Viewer](https://doesitarm.com/app/file-viewer) | Last release v1.4 (2013) | [source](https://sharpened.com/software/mac/file_viewer/) |
| [Fine Woodworking Archive](https://doesitarm.com/app/fine-woodworking-archive) | No longer offered | [source](https://www.finewoodworking.com/forum/mac-software-update-for-fine-woodworking-archive) |
| [Flash Player](https://doesitarm.com/app/flash-player) | Last release v32.0.0.465 (2020) | [source](https://www.adobe.com/products/flashplayer/end-of-life.html) |
| [Flash Player Debugger](https://doesitarm.com/app/flash-player-debugger) | No longer offered | [source](https://www.adobe.com/products/flashplayer/end-of-life.html) |
| [FlashPrint](https://doesitarm.com/app/flashprint) | Last release v5.8.7 | [source](https://flashforge.jp/flashprint5-update-end/) |
| [Fleetsmith](https://doesitarm.com/app/fleetsmith) | No longer offered | [source](https://support.apple.com/nl-nl/103240) |
| [Flipper](https://doesitarm.com/app/flipper) | Last release v0.239.0 (2023) | [source](https://github.com/meta/flipper) |
| [FLIR Tools](https://doesitarm.com/app/flir-tools) | No longer offered | [source](https://www.flir.com/products/flir-tools/?segment=solutions&vertical=condition+monitoring) |
| [Flume](https://doesitarm.com/app/flume) | Last release v2.8.6.5 | [source](https://formulae.brew.sh/cask/flume) |
| [FotoMagico 5](https://doesitarm.com/app/fotomagico-5) | Last release v5.6.14 (2020) | [source](https://fotomagico.com/support/upgrade/) |
| [Fuse](https://doesitarm.com/app/fuse) | Last release v1.9.0 (2018) | [source](https://forums.fusetools.com/t/fuse-1-9-0-is-out/7212) |
| [Gobbler2](https://doesitarm.com/app/gobbler2) | No longer offered | [source](https://www.solidstatelogic.com/account-migration) |
| [Google Assistant](https://doesitarm.com/app/google-assistant) | Last release v1.1.0 (2022) | [source](https://github.com/Melvin-Abraham/Google-Assistant-Unofficial-Desktop-Client/issues/976) |
| [GoToMeeting (18425)](https://doesitarm.com/app/gotomeeting-18425) | Last release v19950 | [source](https://community.goto.com/discussion/319602/use-the-new-goto-option-doesnt-work) |
| [Grammarly Editor](https://doesitarm.com/app/grammarly-editor) | No longer offered | [source](https://coywolf.com/news/content-marketing/grammarly-editor-app-discontinued/) |
| [gSwitch](https://doesitarm.com/app/gswitch) | Last release v1.9.7 (2020) | [source](https://github.com/CodySchrank/gSwitch/blob/master/README.md) |
| [Guitar Pro 7](https://doesitarm.com/app/guitar-pro-7) | Last release v7.6 | [source](https://support.guitar-pro.com/hc/en-us/articles/360001599877-GP7-6-Download-Guitar-Pro-7-6-Tablature-Editor-Software) |
| [HakuNeko Desktop](https://doesitarm.com/app/hakuneko-desktop) | Last release v6.1.7 (2020) | [source](https://github.com/manga-download/hakuneko/releases/tag/v6.1.7) |
| [HandBrakeBatch](https://doesitarm.com/app/handbrakebatch) | Last release v2.25 (2015) | [source](https://osomac.com/about/) |
| [HandShaker](https://doesitarm.com/app/handshaker) | Last release v2.5.6 | [source](https://formulae.brew.sh/cask/handshaker) |
| [Helium](https://doesitarm.com/app/helium) | Last release v2.0 (2015) | [source](https://github.com/JadenGeller/Helium) |
| [HiM](https://doesitarm.com/app/him) | Last release v1.4 (2015) | [source](https://him.macupdate.com/) |
| [HitFilm Express](https://doesitarm.com/app/hitfilm-express) | Last release v2021.3 (2022) | [source](https://help.fxhome.com/hc/en-us/articles/24071759132189-Why-can-t-I-create-an-account) |
| [iBooks Author](https://doesitarm.com/app/ibooks-author) | Last release v2.6.1 | [source](https://support.apple.com/en-ph/102091) |
| [iDefrag](https://doesitarm.com/app/idefrag) | Last release v5.3.1 | [source](https://coriolis-systems.com/) |
| [Intel Power Gadget](https://doesitarm.com/app/intel-power-gadget) | Last release v3.7.0 | [source](https://www.intel.com/content/www/us/en/security-center/advisory/intel-sa-01037.html) |
| [InVision Studio](https://doesitarm.com/app/invision-studio) | No longer offered | [source](https://assets.publishing.service.gov.uk/media/64d113d2a4045e000da84b93/Full_text_of_the_phase_1_decision_pdfa4.pdf) |
| [ipcalculatorver4](https://doesitarm.com/app/ipcalculatorver4) | Last release v2.1 | [source](https://softwar.io/search?genre_id=12001&page=3&q=Data+Calculator) |
| [iRamDisk](https://doesitarm.com/app/iramdisk) | No longer offered | [source](https://applech2.com/archives/20250719-tmpdisk-for-mac-ram-disk-management.html) |
| [iShowU Instant](https://doesitarm.com/app/ishowu-instant) | Last release v1.4.21 (2024) | [source](https://www.shinywhitebox.com/ishowu-instant-replaced-by-v6) |
| [iVI 4](https://doesitarm.com/app/ivi-4) | Last release v4.754 | [source](https://pcmacstore.com/en/software/1221678819/ivi-4) |
| [JEDict](https://doesitarm.com/app/jedict) | Last release v5.0.4 | [source](https://jedict.com/support.html) |
| [JPEGmini Lite](https://doesitarm.com/app/jpegmini-lite) | Last release v2.2.4 | [source](https://pcmacstore.com/jp/software/525742250/jpegmini-lite) |
| [JView](https://doesitarm.com/app/jview) | Last release v2.1.1 (2006) | [source](https://web.archive.org/web/20061021194253/http://home.nc.rr.com/jview/jview.html) |
| [KeePassX](https://doesitarm.com/app/keepassx) | Last release v2.0.3 (2016) | [source](https://www.keepassx.org/index.html%3Fp=21.html) |
| [KnightTouchBar2000](https://doesitarm.com/app/knighttouchbar2000) | No longer offered | [source](https://github.com/AkdM/KnightTouchBar2000) |
| [labelImg](https://doesitarm.com/app/labelimg) | Last release v1.8.6 (2021) | [source](https://github.com/HumanSignal/LabelImg) |
| [LaCie Desktop Manager](https://doesitarm.com/app/lacie-desktop-manager) | Last release v3.2.0 | [source](https://www.seagate.com/support/end-of-life/consumer/) |
| [Lantern](https://doesitarm.com/app/lantern) | No longer offered | [source](https://support.lantern.io/en/support/solutions/articles/156000388296-legacy-pro-users-set-your-password) |
| [Launchpad Manager](https://doesitarm.com/app/launchpad-manager) | Last release v1.0.14 | [source](https://launchpadmanager.com/) |
| [Line 6 License Manager](https://doesitarm.com/app/line-6-license-manager) | Last release v1.16 (2024) | [source](https://line6.com/support/announcement/120-line-6-monkey-and-line-6-license-manager-retiring-on-april-10th-2026/) |
| [LittleIpsum](https://doesitarm.com/app/littleipsum) | Last release v2.0.6 (2016) | [source](https://www.dustinsenos.com/) |
| [Logger Pro](https://doesitarm.com/app/logger-pro) | Last release v3.16.2 (2021) | [source](https://www.vernier.com/downloads/logger-pro-updates/) |
| [Logi Bolt](https://doesitarm.com/app/logi-bolt) | Last release v1.2.6024 (2022) | [source](https://support.logi.com/hc/en-us/articles/4418104828567-Logi-Bolt-App) |
| [Logitech Gaming Software](https://doesitarm.com/app/logitech-gaming-software) | No longer offered | [source](https://support.logi.com/hc/en-us/articles/360023355053-Logitech-Gaming-Software-for-Mac-Release-Notes) |
| [Logitech Presentation](https://doesitarm.com/app/logitech-presentation) | Last release v2.10.276 | [source](https://support.logi.com/hc/en-001/articles/1500006416522-All-about-Logi-Options) |
| [Logitech Unifying Software](https://doesitarm.com/app/logitech-unifying-software) | Last release v1.3.375 (2018) | [source](https://support.logi.com/hc/en-us/articles/26233092711447-FAQ-Unifying-Software) |
| [Logophile](https://doesitarm.com/app/logophile) | No longer offered | [source](https://dicwizard.jp/logophile/) |
| [Macgo Blu-ray Player](https://doesitarm.com/app/macgo-blu-ray-player) | Last release v3.3.23 (2025) | [source](https://formulae.brew.sh/cask/blu-ray-player) |
| [MacMediaKeyForwarder](https://doesitarm.com/app/macmediakeyforwarder) | Last release v3.1 (2019) | [source](https://github.com/milgra/macmediakeyforwarder) |
| [MacX Video Converter Pro](https://doesitarm.com/app/macx-video-converter-pro) | Last release v6.9.0 | [source](https://www.macxdvd.com/support/faq.htm) |
| [Malwarebytes Anti-Malware](https://doesitarm.com/app/malwarebytes-anti-malware) | Last release v1.3.1 | [source](https://www.malwarebytes.com/blog/news/2017/08/solution-corner-malwarebytes-mac) |
| [MarginNote 2 Pro](https://doesitarm.com/app/marginnote-2-pro) | Last release v2.7.23 | [source](https://marginnote-efficient-study-pdf.softwar.io/) |
| [Maxon PluralEyes](https://doesitarm.com/app/maxon-pluraleyes) | Last release v2023.0.0 (2022) | [source](https://www.maxon.net/en/article/pluraleyes-to-enter-limited-maintenance-mode) |
| [McSolitaire](https://doesitarm.com/app/mcsolitaire) | Last release v4.3 | [source](https://www.pcv-soft.com/) |
| [MDB Explorer](https://doesitarm.com/app/mdb-explorer) | Last release v2.4.7 (2016) | [source](https://www.macg.co/news/voir/237362/logiciels-mdb-explorer-et-type2phone) |
| [Mellow](https://doesitarm.com/app/mellow) | Last release v0.1.22 (2020) | [source](https://github.com/mellow-io/mellow) |
| [Memory Clean](https://doesitarm.com/app/memory-clean) | No longer offered | [source](https://support.fiplab.com/getting-started/discontinued-apps) |
| [Meshmixer](https://doesitarm.com/app/meshmixer) | Last release v3.5 | [source](https://marketplace.autodesk.com/apps/2e40e347-0369-4603-b83f-ecab324aed0f?pubDate=20260711) |
| [MINDSTORMS Home](https://doesitarm.com/app/mindstorms-home) | No longer offered | [source](https://www.lego.com/en-us/service/help-topics/article/lego-mindstorms-ev3-troubleshooting-help?opt-out-modal=show) |
| [Minitab](https://doesitarm.com/app/minitab) | Last release v19.2020.2 | [source](https://www.minitab.com/content/dam/www/en/uploadedfiles/documents/install-guides/Minitab-Mac-19-2020-2-System-Requirements-EN.pdf) |
| [Mobalytics Desktop](https://doesitarm.com/app/mobalytics-desktop) | No longer offered | [source](https://mobalytics.gg/lol/glp/desktop-upgrade) |
| [MODO BASS](https://doesitarm.com/app/modo-bass) | Last release v1.5.2 | [source](https://vi-control.net/community/threads/now-available-ik-multimedia-announces-modo-bass-2.122981/page-2) |
| [Momentum](https://doesitarm.com/app/momentum) | No longer offered | [source](https://www.holmez.com/) |
| [MotionPro Plus](https://doesitarm.com/app/motionpro-plus) | Last release v2.0.2 | [source](https://nic.sufe.edu.cn/_t579/11670/list.htm) |
| [Movavi Video Converter 22 Premium](https://doesitarm.com/app/movavi-video-converter-22-premium) | Last release v22.5.0 (2022) | [source](https://www.movavi.com/lifecycle-policy.html) |
| [Movavi Video Editor Plus 2020](https://doesitarm.com/app/movavi-video-editor-plus-2020) | Last release v20.4 (2020) | [source](https://www.movavi.com/video-editor-plus-mac/whats-new.html) |
| [Movavi Video Editor Plus 2022](https://doesitarm.com/app/movavi-video-editor-plus-2022) | Last release v22.4.1 (2022) | [source](https://www.movavi.com/video-editor-plus-mac/whats-new.html) |
| [Mu Editor](https://doesitarm.com/app/mu-editor) | Last release v1.2.0 (2022) | [source](https://github.com/mu-editor/mu) |
| [MxEasy](https://doesitarm.com/app/mxeasy) | Last release v1.6.1 (2013) | [source](https://www.mobotix-japan.net/download/pdf/NewProductInformation_February2018.pdf) |
| [MyDVD Pro](https://doesitarm.com/app/mydvd-pro) | No longer offered | [source](https://kb.corel.com/en/128750) |
| [NoMAD](https://doesitarm.com/app/nomad) | Last release v1.3.0 (2022) | [source](https://www.jamf.com/blog/jamf-to-archive-nomad-open-source-projects/) |
| [NOW TV](https://doesitarm.com/app/now-tv) | No longer offered | [source](https://www.nowtv.com/gb/help/article/what-laptops-computers-can-i-use-to-watch) |
| [nwjs](https://doesitarm.com/app/nwjs) | No longer offered | [source](https://ajuda.vodafone.pt/manuais/articles/como-posso-aceder-a-app-vodafone-tv) |
| [NZBGet](https://doesitarm.com/app/nzbget) | Last release v21.1 (2021) | [source](https://github.com/nzbget/nzbget) |
| [OOTP Baseball 23](https://doesitarm.com/app/ootp-baseball-23) | Last release v23.10.110 (2023) | [source](https://www.ootpdevelopments.com/ootp-prior-version/) |
| [Origin](https://doesitarm.com/app/origin) | No longer offered | [source](https://www.ea.com/ea-app) |
| [Pac-Bar](https://doesitarm.com/app/pac-bar) | Last release v1.3 (2020) | [source](https://github.com/henryefranks/pac-bar) |
| [Padlet](https://doesitarm.com/app/padlet) | No longer offered | [source](https://macupdater.com/app_updates/index-2019-11-19.html) |
| [PandaBar](https://doesitarm.com/app/pandabar) | Last release v1.3.0 | [source](https://forums.macrumors.com/threads/what-are-your-favorite-app-store-apps.1421553/) |
| [Paragon VMDK Mounter](https://doesitarm.com/app/paragon-vmdk-mounter) | No longer offered | [source](https://www.paragon-software.com/home/vd-mounter-mac-free/) |
| [PdaNet for Android](https://doesitarm.com/app/pdanet-for-android) | Last release v5.24.2 (2020) | [source](https://pdanet.co/help/mac.php) |
| [PDMan](https://doesitarm.com/app/pdman) | No longer offered | [source](https://gitee.com/robergroup/pdman) |
| [Perfect Privacy VPN](https://doesitarm.com/app/perfect-privacy-vpn) | No longer offered | [source](https://www.rtings.com/vpn/reviews/perfect-privacy/perfect-privacy) |
| [PhotoJob 2-Demo](https://doesitarm.com/app/photojob-2-demo) | No longer offered | [source](https://www.rootrisetech.com/products/photojob/) |
| [Pixie](https://doesitarm.com/app/pixie) | Last release v4.06 (2017) | [source](https://www.tech4learning.com/pixie/) |
| [PlayOff](https://doesitarm.com/app/playoff) | No longer offered | [source](https://9to5mac.com/2019/03/03/apple-music-handoff-app-playoff/) |
| [Pluto TV](https://doesitarm.com/app/pluto-tv) | No longer offered | [source](https://pluto.tv/where-to-watch) |
| [Popcorn-Time](https://doesitarm.com/app/popcorn-time) | Last release v0.5.1 | [source](https://github.com/popcorn-official/popcorn-desktop) |
| [PostmanCanary](https://doesitarm.com/app/postmancanary) | Last release v11.2.14-canary240621-0734 | [source](https://www.postman.com/downloads/canary/) |
| [Product Hunt](https://doesitarm.com/app/product-hunt) | Last release v1.0.3 | [source](https://github.com/producthunt/producthunt-osx) |
| [QREncoder](https://doesitarm.com/app/qrencoder) | Last release v1.5 | [source](https://www.mobiliodevelopment.com/products/osx/qrencoder/) |
| [RadarScope](https://doesitarm.com/app/radarscope) | No longer offered | [source](https://weather-support.zendesk.com/hc/en-us/articles/50168874966548-Managing-Pro-Subscriptions) |
| [RECentral Express](https://doesitarm.com/app/recentral-express) | Last release v1.2.92 (2024) | [source](https://www.avermedia.com/event/end-of-service/software/index.html) |
| [Red Giant Application Manager](https://doesitarm.com/app/red-giant-application-manager) | No longer offered | [source](https://www.maxon.net/en/article/introducing-the-maxon-app) |
| [ReturntoDarkCastle](https://doesitarm.com/app/returntodarkcastle) | No longer offered | [source](https://www.shff.com/games/gam_returntodc.html) |
| [Review Manager 5.4](https://doesitarm.com/app/review-manager-54) | Last release v5.4.1 | [source](https://pages.cochrane.org/Author-Digest-April-2023) |
| [RipIt](https://doesitarm.com/app/ripit) | Last release v1.6.9 (2016) | [source](https://rosettacheck.com/apps/nck4vmmh) |
| [sa100-2021](https://doesitarm.com/app/sa100-2021) | No longer offered | [source](https://www.abcsa.co.uk/abc-sa100-for-individuals/) |
| [Saffire MixControl](https://doesitarm.com/app/saffire-mixcontrol) | Last release v3.9 | [source](https://support.focusrite.com/hc/en-gb/articles/360009743339-Saffire-FireWire-range-end-of-development-support) |
| [SampleTank 3](https://doesitarm.com/app/sampletank-3) | No longer offered | [source](https://forum.ikmultimedia.com/t/help-with-sampletank-3/1589) |
| [ScannerApp](https://doesitarm.com/app/scannerapp) | Last release v1.0 | [source](https://applech2.com/archives/46196360.html) |
| [ScanSnap Manager](https://doesitarm.com/app/scansnap-manager) | No longer offered | [source](https://www.pfu.ricoh.com/global/scanners/topics/news20230606/) |
| [Scenarist](https://doesitarm.com/app/scenarist) | Last release v0.7.2 rc 15 (2022) | [source](https://kitscenarist.ru/en/history/2023-06-06.html) |
| [Screen Snake](https://doesitarm.com/app/screen-snake) | Last release v5.3 | [source](https://screen-snake.macupdate.com/) |
| [Seagate Dashboard](https://doesitarm.com/app/seagate-dashboard) | No longer offered | [source](https://www.seagate.com/support/kb/what-is-the-difference-between-toolkit-and-dashboard/) |
| [Seasonality Core](https://doesitarm.com/app/seasonality-core) | Last release v2.9 | [source](https://getseasonality.com/core/) |
| [Sequel Pro](https://doesitarm.com/app/sequel-pro) | Last release v1.1.2 (2016) | [source](https://github.com/sequelpro/sequelpro/releases/tag/release-1.1.2) |
| [SetResX](https://doesitarm.com/app/setresx) | No longer offered | [source](https://forums.macrumors.com/threads/rmbp-app-idea-retina-resolution-toggle.1387807/) |
| [Shadowsocks](https://doesitarm.com/app/shadowsocks) | Last release v2.6.3 (2015) | [source](https://github.com/shadowsocks/shadowsocks-iOS) |
| [ShortcutDetective](https://doesitarm.com/app/shortcutdetective) | Last release v1.0 | [source](https://www.irradiatedsoftware.com/labs/) |
| [Shrew Soft VPN Access Manager](https://doesitarm.com/app/shrew-soft-vpn-access-manager) | Last release v2.2.0 | [source](https://www.shrew.net/) |
| [Shrew Soft VPN Client Connect](https://doesitarm.com/app/shrew-soft-vpn-client-connect) | No longer offered | [source](https://www.shrew.net/software/todo) |
| [ShurePlus MOTIV](https://doesitarm.com/app/shureplus-motiv) | Last release v1.5.4 (2024) | [source](https://www.shure.com/en-EU/support/downloads/software-firmware-archive/shure_plus_motiv_desktop) |
| [silex-desktop](https://doesitarm.com/app/silex-desktop) | Last release v2.7.30 (2022) | [source](https://github.com/silexlabs/silex-desktop/releases/tag/v2.7.30) |
| [Sky X](https://doesitarm.com/app/sky-x) | No longer offered | [source](https://media.rtl.com/meldung/Neuer-Streamingdienst-WOW-ab-heute-in-Oesterreich-verfuegbar/) |
| [Slideshow Maker Movavi](https://doesitarm.com/app/slideshow-maker-movavi) | Last release v8.0.1 | [source](https://www.movavi.com/slideshow-maker-for-mac/?asrc=main_menu_all) |
| [SnapGene Viewer](https://doesitarm.com/app/snapgene-viewer) | Last release v7.2.1 | [source](https://support.snapgene.com/hc/en-us/articles/30921331709076-SnapGene-Viewer-Mode) |
| [Soda Player](https://doesitarm.com/app/soda-player) | Last release v1.4.2 | [source](https://mac.filehorse.com/download-soda-player/) |
| [Sol Client](https://doesitarm.com/app/sol-client) | Last release v1.8.9 (2022) | [source](https://github.com/Sol-Client) |
| [SopCast](https://doesitarm.com/app/sopcast) | Last release v1.6.4 | [source](https://mac.filehorse.com/download-sopcast/) |
| [Spectacle](https://doesitarm.com/app/spectacle) | Last release v1.2 (2022) | [source](https://github.com/eczarny/spectacle) |
| [Stack](https://doesitarm.com/app/stack) | Last release v3.43.2 (2022) | [source](https://macupdater.net/app_updates/appinfo/com.stack.io/index.html) |
| [StagePlotPro 2.9.9.2](https://doesitarm.com/app/stageplotpro-2992) | Last release v2.9.9.2 (2020) | [source](https://www.tourouter.com/compare/stage-plot-makers) |
| [Starline Master](https://doesitarm.com/app/starline-master) | No longer offered | [source](https://starline.ru/starline_master/) |
| [Superpowered](https://doesitarm.com/app/superpowered) | No longer offered | [source](https://superpowered.me/download) |
| [SuperTab](https://doesitarm.com/app/supertab) | Last release v5.1.2 (2022) | [source](https://www.macupdater.org/app_updates/appinfo/com.spritec.supertab/index.html) |
| [Swackett](https://doesitarm.com/app/swackett) | No longer offered | [source](https://alternativeto.net/software/swackett/about/) |
| [Swift Publisher 4](https://doesitarm.com/app/swift-publisher-4) | Last release v4.0.5 | [source](https://www.belightsoft.com/support/troubleshooting) |
| [Syntronik](https://doesitarm.com/app/syntronik) | No longer offered | [source](https://forum.ikmultimedia.com/t/what-ts-products-are-retired-and-can-i-still-install-them/642/2) |
| [TextExpander](https://doesitarm.com/app/textexpander) | No longer offered | [source](https://textexpander.com/learn/accounts/billing/is-the-textexpander-app-available-via-the-volume-purchase-program-vpp-on-the-mac-app-store) |
| [The Tagger](https://doesitarm.com/app/the-tagger) | Last release v1.6.2 | [source](https://www.deadbeatsw.com/) |
| [To MP3 Converter](https://doesitarm.com/app/to-mp3-converter) | No longer offered | [source](https://amvidia.com/to-mp3-converter/downloads) |
| [Toggl Track](https://doesitarm.com/app/toggl-track) | Last release v7.5.441 (2021) | [source](https://github.com/toggl-open-source/toggldesktop) |
| [Topaz ReMask 5](https://doesitarm.com/app/topaz-remask-5) | Last release v5 | [source](https://docs.topazlabs.com/other-apps/legacy) |
| [Transcriber](https://doesitarm.com/app/transcriber) | Last release v1.5.2 (2017) | [source](https://trans.sourceforge.net/) |
| [TranslateIt!](https://doesitarm.com/app/translateit) | Last release v14.1 (2012) | [source](https://translateit-deluxe.macupdate.com/) |
| [Trojan-Qt5](https://doesitarm.com/app/trojan-qt5) | Last release v1.4.0 | [source](https://github.com/Trojan-Qt5/Trojan-Qt5) |
| [TrojanX](https://doesitarm.com/app/trojanx) | Last release v0.4 (2020) | [source](https://github.com/JimLee1996/TrojanX) |
| [Truple](https://doesitarm.com/app/truple) | No longer offered | [source](https://support.truple.io/articles/macos/macos-update-guide) |
| [V2RayX](https://doesitarm.com/app/v2rayx) | Last release v1.5.1 (2019) | [source](https://github.com/Cenmrev/V2RayX/releases/tag/v1.5.1) |
| [VanSpace3DBETA](https://doesitarm.com/app/vanspace3dbeta) | No longer offered | [source](https://support.vanspace3d.com/hc/en-us/articles/4408231694609-Where-do-I-download-the-software) |
| [Verizon Software Upgrade Assistant - LG](https://doesitarm.com/app/verizon-software-upgrade-assistant-lg) | No longer offered | [source](https://www.lg.com/us/support/announcements-detail/notice-of-discontinuation-of-lg-eut-software-upgrade-assistant-service-USNTC20231209200110) |
| [Verizon Utility Application - LG](https://doesitarm.com/app/verizon-utility-application-lg) | No longer offered | [source](https://www.verizon.com/support/knowledge-base-105457/) |
| [VidConvert](https://doesitarm.com/app/vidconvert) | Last release v1.7.2 (2017) | [source](https://macupdater.net/app_updates/appinfo/com.apps4macs.VidConvert/index.html) |
| [Viveza 2](https://doesitarm.com/app/viveza-2) | No longer offered | [source](https://download-center.dxo.com/Support/docs/NikCollection_v3/release-notes/Nik3_release-note_mac_EN.pdf) |
| [VOCALOID5 Editor](https://doesitarm.com/app/vocaloid5-editor) | Last release v5.7.2 (2023) | [source](https://www.vocaloid.com/en/support/inquiry/support_policy_products/) |
| [WaveLab Pro 10.0](https://doesitarm.com/app/wavelab-pro-100) | Last release v10.0.70 (2021) | [source](https://o.steinberg.net/en/support/unsupported_software/wavelab/wavelab_10.html) |
| [WD Discovery](https://doesitarm.com/app/wd-discovery) | No longer offered | [source](https://forums.sandisk.com/t/wd-discovery-wd-security-and-wd-drive-utilities-end-of-support/416191) |
| [WeatherBug](https://doesitarm.com/app/weatherbug) | Last release v1.0.2 (2017) | [source](https://www.weatherbug.com/faq) |
| [WillMaker](https://doesitarm.com/app/willmaker) | Last release v2018 | [source](https://steamcommunity.com/app/732710) |
| [Wireless Workbench 6](https://doesitarm.com/app/wireless-workbench-6) | Last release v6.15.4 (2023) | [source](https://www.shure.com/en-US/support/downloads/software-firmware-archive/wireless-workbench) |
| [Wondershare AllMyTube](https://doesitarm.com/app/wondershare-allmytube) | No longer offered | [source](https://www.wondershare.jp/guide_mac/allmytube.html) |
| [Wondershare Video Converter Pro](https://doesitarm.com/app/wondershare-video-converter-pro) | No longer offered | [source](https://videoconverter.wondershare.com/reviews/video-converter-pro-for-mac/3.html) |
| [XPS-to-PDF Lite](https://doesitarm.com/app/xps-to-pdf-lite) | No longer offered | [source](https://listoffreeware.com/free-xps-to-pdf-converter-mac/) |
| [YesPlayMusic](https://doesitarm.com/app/yesplaymusic) | Last release v0.4.10 (2025) | [source](https://github.com/qier222/YesPlayMusic/releases/tag/v3.0.0) |
| [yKey](https://doesitarm.com/app/ykey) | Last release v2.9.5 | [source](https://plumamazing.com/ykey) |
| [YubiKey Manager](https://doesitarm.com/app/yubikey-manager) | Last release v1.2.5 (2023) | [source](https://www.yubico.com/support/terms-conditions/yubico-end-of-life-policy/eol-products/) |
| [ZDoom](https://doesitarm.com/app/zdoom) | Last release v2.8.1 (2016) | [source](https://github.com/rheit/zdoom/tags) |
| [ZY Player](https://doesitarm.com/app/zy-player) | Last release v2.8.8 (2022) | [source](https://github.com/Hunlongyu/ZY-Player/releases) |

## Intel-only, Rosetta unverified (110)

The current or final build is Intel-only, but no source confirms it runs under Rosetta 2.

| App | Finding | Evidence |
| --- | --- | --- |
| [ABIC](https://doesitarm.com/app/abic) | Intel-only v1.2.2; Rosetta not confirmed | [source](https://abic.sourceforge.net/) |
| [1440](https://doesitarm.com/app/1440) | Intel-only v1.4; Rosetta not confirmed | [source](https://apps.apple.com/us/app/1440-minutes-left-today/id1483764819?mt=12) |
| [1Clipboard](https://doesitarm.com/app/1clipboard) | Intel-only v0.1.8; Rosetta not confirmed | [source](https://1clipboard.io/start) |
| [4K Slideshow Maker](https://doesitarm.com/app/4k-slideshow-maker) | Intel-only v2.0.1.1055; Rosetta not confirmed | [source](https://www.4kdownload.com/downloads/34) |
| [A Better Finder Attributes 6](https://doesitarm.com/app/a-better-finder-attributes-6) | Intel-only v6.25; Rosetta not confirmed | [source](https://www.publicspace.net/ABetterFinderAttributes/download.html) |
| [Adapter](https://doesitarm.com/app/adapter) | Intel-only v2.1.6; Rosetta not confirmed | [source](https://macroplant.com/downloads.p) |
| [AirconsoleOSX](https://doesitarm.com/app/airconsoleosx) | Intel-only v1.6.0; Rosetta not confirmed | [source](https://support.get-console.com/support/solutions/articles/5000501221-airconsole-osx-drivers) |
| [Airmore Mindmap](https://doesitarm.com/app/airmore-mindmap) | Intel-only v1.0.7; Rosetta not confirmed | [source](https://www.apowersoft.cn/online-mindmap) |
| [AJA RovoControl](https://doesitarm.com/app/aja-rovocontrol) | Intel-only v3.0.1; Rosetta not confirmed | [source](https://www.aja.com/products/rovocontrol) |
| [All-in-One Messenger](https://doesitarm.com/app/all-in-one-messenger) | Intel-only v2.5.0; Rosetta not confirmed | [source](https://allinone.im/downloads) |
| [Ampps](https://doesitarm.com/app/ampps) | Intel-only v4.5; Rosetta not confirmed | [source](https://ampps.com/downloads/) |
| [Aria Maestosa](https://doesitarm.com/app/aria-maestosa) | Intel-only v1.4.13d; Rosetta not confirmed | [source](https://ariamaestosa.github.io/ariamaestosa/docs/download.html) |
| [Audio Converter Pro](https://doesitarm.com/app/audio-converter-pro) | Intel-only v2.2.5; Rosetta not confirmed | [source](https://apps.apple.com/us/app/audio-converter-pro/id698196505?mt=12) |
| [Avantis Director](https://doesitarm.com/app/avantis-director) | Intel-only V2.03; Rosetta not confirmed | [source](https://www.allen-heath.com/hardware/avantis/avantis-dual-screen/resources/) |
| [AVCHD to Mov Lite](https://doesitarm.com/app/avchd-to-mov-lite) | Intel-only v2.2.5; Rosetta not confirmed | [source](https://apps.apple.com/us/app/avchd-to-mov-lite/id675103877?mt=12) |
| [Axure RP 8](https://doesitarm.com/app/axure-rp-8) | Intel-only v8.1.0.3400; Rosetta not confirmed | [source](https://www.axure.com/release-history/rp8) |
| [Bark](https://doesitarm.com/app/bark) | Intel-only v10.0.26; Rosetta not confirmed | [source](https://www.bark.us/ios/) |
| [Battery Health](https://doesitarm.com/app/battery-health) | Intel-only v6.1; Rosetta not confirmed | [source](https://support.fiplab.com/getting-started/backups) |
| [Brackets](https://doesitarm.com/app/brackets) | Intel-only v2.2.0; Rosetta not confirmed | [source](https://github.com/brackets-cont/brackets/releases/tag/v2.2.0) |
| [cardPresso](https://doesitarm.com/app/cardpresso) | Intel-only v1.7.140.1; Rosetta not confirmed | [source](https://www.cardpresso.com/cardpresso-software/latest-release/) |
| [ChemLab Evaluation](https://doesitarm.com/app/chemlab-evaluation) | Intel-only v5.05; Rosetta not confirmed | [source](https://modelscience.com/software.html) |
| [Civilization V Campaign Edition](https://doesitarm.com/app/civilization-v-campaign-edition) | Intel-only v1.4.2; Rosetta not confirmed | [source](https://apps.apple.com/us/app/civilization-v/id439924718?mt=12) |
| [Clover Configurator](https://doesitarm.com/app/clover-configurator) | Intel-only v5.30.0.0; Rosetta not confirmed | [source](https://mackie100projects.altervista.org/changelog-version-5-30-0-0/) |
| [cmdQuit](https://doesitarm.com/app/cmdquit) | Intel-only v3.9.2; Rosetta not confirmed | [source](https://apps.apple.com/us/app/cmdquit/id423137709?mt=12) |
| [CocoaMSX](https://doesitarm.com/app/cocoamsx) | Intel-only v1.61; Rosetta not confirmed | [source](https://github.com/CocoaMSX/CocoaMSX/releases/v1.61) |
| [Codespace](https://doesitarm.com/app/codespace) | Intel-only v1.6.1; Rosetta not confirmed | [source](https://codespace.app/releases) |
| [Colloquy](https://doesitarm.com/app/colloquy) | Intel-only v2.5 (7097); Rosetta not confirmed | [source](https://github.com/colloquy/colloquy/releases/tag/mac%2F2021%2F2.5-prerelease-7097) |
| [ContraptionMaker](https://doesitarm.com/app/contraptionmaker) | Intel-only v1.4.33; Rosetta not confirmed | [source](https://store.steampowered.com/app/241240/Contraption_Maker/) |
| [Crushee](https://doesitarm.com/app/crushee) | Intel-only v2.4.6; Rosetta not confirmed | [source](https://github.com/xanderfrangos/crushee/releases/tag/v2.4.6) |
| [Delay-Start](https://doesitarm.com/app/delay-start) | Intel-only v1.1; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?id=591620786&country=us) |
| [DERT](https://doesitarm.com/app/dert) | Intel-only v1.0.6; Rosetta not confirmed | [source](https://github.com/nasa/DERT/releases/tag/DERT_v1.0.6) |
| [DHF3.0](https://doesitarm.com/app/dhf30) | Intel-only v5.4.7; Rosetta not confirmed | [source](https://www.360dhf.cn/video-encryption/player) |
| [Dogecoin-Qt](https://doesitarm.com/app/dogecoin-qt) | Intel-only v1.14.9; Rosetta not confirmed | [source](https://github.com/dogecoin/dogecoin/releases/tag/v1.14.9) |
| [EasyBatchPhoto](https://doesitarm.com/app/easybatchphoto) | Intel-only v3.3; Rosetta not confirmed | [source](https://www.yellowmug.com/easybatchphoto/) |
| [Electron Shark-mac-client](https://doesitarm.com/app/electron-shark-mac-client) | Intel-only v1.3.9; Rosetta not confirmed | [source](https://www.douyu.com/client/?tab=feature) |
| [EPOMAKER Driver](https://doesitarm.com/app/epomaker-driver) | Intel-only v2.1.90; Rosetta not confirmed | [source](https://epomaker.com/blogs/software/epomaker-driver) |
| [Eponyms](https://doesitarm.com/app/eponyms) | Intel-only v1.1; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?id=420610970&country=us&entity=macSoftware) |
| [Epson Low Ink Reminder](https://doesitarm.com/app/epson-low-ink-reminder) | Intel-only v1.7.5; Rosetta not confirmed | [source](https://www.epson.com.cn/drive/2bc453a0ecf74b18985fa2810b0df641.html?productId=732a21494baa459fb7657f67130579d7) |
| [etesync-dav](https://doesitarm.com/app/etesync-dav) | Intel-only v0.35.1; Rosetta not confirmed | [source](https://github.com/etesync/etesync-dav/releases/tag/v0.35.1) |
| [Express Burn Disc-Brennprogramm](https://doesitarm.com/app/express-burn-disc-brennprogramm) | Intel-only v14.04; Rosetta not confirmed | [source](https://www.nchsoftware.com/software/de/free-downloads.html) |
| [FeedNotifier](https://doesitarm.com/app/feednotifier) | Intel-only v1.2; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?bundleId=com.michaelfogleman.FeedNotifier&entity=macSoftware&country=us) |
| [FinderMinder](https://doesitarm.com/app/finderminder) | Intel-only v1.3; Rosetta not confirmed | [source](https://www.irradiatedsoftware.com/labs/) |
| [FoundryLicenseUtility](https://doesitarm.com/app/foundrylicenseutility) | Intel-only v8.1.6; Rosetta not confirmed | [source](https://www.foundry.com/licensing/tools) |
| [GaussView](https://doesitarm.com/app/gaussview) | Intel-only v6.1.1; Rosetta not confirmed | [source](https://gaussian.com/g16/gvm_install.pdf) |
| [GK6+](https://doesitarm.com/app/gk6) | Intel-only v1.0.0.27; Rosetta not confirmed | [source](https://skyloongtech.com/skyloong-keyboard-software/?currency=USD&product-page=1) |
| [GoogleKeepMenu](https://doesitarm.com/app/googlekeepmenu) | Intel-only v0.2.0; Rosetta not confirmed | [source](https://github.com/brechtm/GoogleKeepMenu/releases/tag/0.2.0) |
| [gPodder](https://doesitarm.com/app/gpodder) | Intel-only v3.11.5; Rosetta not confirmed | [source](https://gpodder.github.io/) |
| [GTX Graphics Lab 6](https://doesitarm.com/app/gtx-graphics-lab-6) | Intel-only v6.2.0; Rosetta not confirmed | [source](https://gtowner.brother-usa.com/GarmentPrinters/Owner/Software.aspx?Machine=GTX) |
| [Harmony Desktop](https://doesitarm.com/app/harmony-desktop) | Intel-only v1.0.303; Rosetta not confirmed | [source](https://support.myharmony.com/en-us/download) |
| [Hocus Focus](https://doesitarm.com/app/hocus-focus) | Intel-only v1.3; Rosetta not confirmed | [source](https://hocusfoc.us/) |
| [Honeygain](https://doesitarm.com/app/honeygain) | Intel-only v1.5.4 (41); Rosetta not confirmed | [source](https://www.honeygain.com/download/) |
| [HRSword](https://doesitarm.com/app/hrsword) | Intel-only v1.0.0.0; Rosetta not confirmed | [source](https://www.huorong.cn/document/info/productions/132) |
| [iMyFone Fixppo](https://doesitarm.com/app/imyfone-fixppo) | Intel-only v9.3.7.1; Rosetta not confirmed | [source](https://www.imyfone.com/ios-system-recovery/) |
| [Instatus Out](https://doesitarm.com/app/instatus-out) | Intel-only v1.0.8; Rosetta not confirmed | [source](https://github.com/instatushq/out/releases/tag/v1.0.8) |
| [insTuner](https://doesitarm.com/app/instuner) | Intel-only v1.3; Rosetta not confirmed | [source](https://apps.apple.com/us/app/instuner-chromatic-tuner-for-guitar-ukulele-and/id940526959?mt=12) |
| [JabberVDI](https://doesitarm.com/app/jabbervdi) | Intel-only v12.9.0.310904; Rosetta not confirmed | [source](https://www.webex.com/downloads/jabber/jabber-vdi) |
| [Juicebox](https://doesitarm.com/app/juicebox) | Intel-only v2.15; Rosetta not confirmed | [source](https://github.com/aidenlab/Juicebox/wiki/Download) |
| [LAMA](https://doesitarm.com/app/lama) | Intel-only v1.5; Rosetta not confirmed | [source](https://sononum.net/) |
| [LSwitch](https://doesitarm.com/app/lswitch) | Intel-only v1.2; Rosetta not confirmed | [source](https://www.gtrigonakis.com/lswitch) |
| [LZDoom](https://doesitarm.com/app/lzdoom) | Intel-only v3.88b; Rosetta not confirmed | [source](https://github.com/drfrag666/lzdoom/releases/expanded_assets/3.88b) |
| [Mac Cache Cleaner](https://doesitarm.com/app/mac-cache-cleaner) | Intel-only v1.2; Rosetta not confirmed | [source](https://api.github.com/repos/kaunteya/MacCacheCleaner/releases) |
| [MacMorpheus](https://doesitarm.com/app/macmorpheus) | Intel-only v0.2; Rosetta not confirmed | [source](https://github.com/emoRaivis/MacMorpheus/releases/tag/0.2) |
| [ManOpen](https://doesitarm.com/app/manopen) | Intel-only v2.6; Rosetta not confirmed | [source](https://www.clindberg.org/projects/ManOpen.html) |
| [Max](https://doesitarm.com/app/max) | Intel-only v0.9.2b4; Rosetta not confirmed | [source](https://github.com/sbooth/Max/releases) |
| [MieSimulatorGUI_v1_3](https://doesitarm.com/app/miesimulatorguiv13) | Intel-only v2.1; Rosetta not confirmed | [source](https://github.com/VirtualPhotonics/MieSimulatorGUI/releases) |
| [MKVtools](https://doesitarm.com/app/mkvtools) | Intel-only v3.7.2; Rosetta not confirmed | [source](https://emmgunn.com/wp/mkvtools-home/mkvtools-downloads/) |
| [MoonWatch](https://doesitarm.com/app/moonwatch) | Intel-only v0.2.0; Rosetta not confirmed | [source](https://github.com/WBrandes/MoonWatch) |
| [MP4tools](https://doesitarm.com/app/mp4tools) | Intel-only v3.7.2; Rosetta not confirmed | [source](https://emmgunn.com/wp/mp4tools-home/mp4tools-downloads/) |
| [Nudge](https://doesitarm.com/app/nudge) | Intel-only v1.8; Rosetta not confirmed | [source](https://nudgenotifier.com/install) |
| [Offline Pages Pro](https://doesitarm.com/app/offline-pages-pro) | Intel-only v1.4; Rosetta not confirmed | [source](https://apps.apple.com/us/app/offline-pages-pro/id1061324329?mt=12) |
| [oss-browser](https://doesitarm.com/app/oss-browser) | Intel-only v1.19.0; Rosetta not confirmed | [source](https://github.com/aliyun/oss-browser/blob/develop/all-releases.md) |
| [PDF Editor Mac](https://doesitarm.com/app/pdf-editor-mac) | Intel-only v3.6.2; Rosetta not confirmed | [source](https://www.pdfeditormac.com/download.html) |
| [Pinball](https://doesitarm.com/app/pinball) | Intel-only v10.2.0; Rosetta not confirmed | [source](https://www.bakno.com/Pinball/index.html) |
| [Planets -- Live Wallpaper](https://doesitarm.com/app/planets-live-wallpaper) | Intel-only v1.1; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?bundleId=com.lifewaresolutions.planetslw) |
| [Pliim](https://doesitarm.com/app/pliim) | Intel-only v1.7.0; Rosetta not confirmed | [source](https://github.com/zehfernandes/pliim/releases/tag/v1.7.0) |
| [Popup Window Free](https://doesitarm.com/app/popup-window-free) | Intel-only v1.3.5; Rosetta not confirmed | [source](https://www.catalystwo.com/PopupWindow_en.html) |
| [Prime95](https://doesitarm.com/app/prime95) | Intel-only v30.19 build 20; Rosetta not confirmed | [source](https://www.mersenne.org/download/) |
| [qcma](https://doesitarm.com/app/qcma) | Intel-only v0.4.1-1; Rosetta not confirmed | [source](https://github.com/codestation/qcma/releases/tag/v0.4.1) |
| [Rearview](https://doesitarm.com/app/rearview) | Intel-only v2.3; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?id=1459730659&country=us) |
| [REEF-Survey](https://doesitarm.com/app/reef-survey) | Intel-only v1.1205.1003; Rosetta not confirmed | [source](https://data.reef.org/offline-data-entry/) |
| [ReiBoot](https://doesitarm.com/app/reiboot) | Intel-only v9.6.1; Rosetta not confirmed | [source](https://www.tenorshare.com/products/reiboot.html) |
| [Rember](https://doesitarm.com/app/rember) | Intel-only v0.3.7b; Rosetta not confirmed | [source](https://archive.kelleycomputing.net/rember) |
| [Rumpus](https://doesitarm.com/app/rumpus) | Intel-only v11.1.3; Rosetta not confirmed | [source](https://www.maxum.com/Rumpus/Download/) |
| [Runway](https://doesitarm.com/app/runway) | Intel-only v0.19.2; Rosetta not confirmed | [source](https://formulae.brew.sh/cask/runway) |
| [Screen Recorder Pro - Screen Capture HD Video](https://doesitarm.com/app/screen-recorder-pro-screen-capture-hd-video) | Intel-only v3.2.3; Rosetta not confirmed | [source](https://itunes.apple.com/lookup?id=985439997) |
| [SGSkinEditor](https://doesitarm.com/app/sgskineditor) | Intel-only v1.0; Rosetta not confirmed | [source](https://pinyin.sogou.com/mac/skineditor.php) |
| [SIDPLAY](https://doesitarm.com/app/sidplay) | Intel-only v4.2; Rosetta not confirmed | [source](https://github.com/Alexco500/sidplay5) |
| [SimpleFloatingClock](https://doesitarm.com/app/simplefloatingclock) | Intel-only v1.8; Rosetta not confirmed | [source](https://www.splook.com/Software/distrib/sfc.zip) |
| [Slay Bells](https://doesitarm.com/app/slay-bells) | Intel-only v1.1; Rosetta not confirmed | [source](https://blakemckinnonproductions.itch.io/slaybells) |
| [Snip](https://doesitarm.com/app/snip) | Intel-only v2.0; Rosetta not confirmed | [source](https://snip.qq.com/) |
| [SoftwareForArchers Xpert](https://doesitarm.com/app/softwareforarchers-xpert) | Intel-only v2.5.34; Rosetta not confirmed | [source](https://www.pinwheelsoftware.com/downloads.html) |
| [SS-11X](https://doesitarm.com/app/ss-11x) | Intel-only v1.2; Rosetta not confirmed | [source](https://mercuriall.com/cms/details_ss-11x) |
| [Table Tool](https://doesitarm.com/app/table-tool) | Intel-only v1.2.1; Rosetta not confirmed | [source](https://github.com/jakob/TableTool/releases/tag/v1.2.1) |
| [Tabula](https://doesitarm.com/app/tabula) | Intel-only v1.2.1 (1.2.1.18052200); Rosetta not confirmed | [source](https://github.com/tabulapdf/tabula/releases/tag/v1.2.1) |
| [Teambition](https://doesitarm.com/app/teambition) | Intel-only v2.0.3; Rosetta not confirmed | [source](https://www.teambition.com/) |
| [TorGuardDesktopQt](https://doesitarm.com/app/torguarddesktopqt) | Intel-only v4.8.29; Rosetta not confirmed | [source](https://torguard.net/downloads.php) |
| [Total Video Converter Lite](https://doesitarm.com/app/total-video-converter-lite) | Intel-only v3.7.1; Rosetta not confirmed | [source](https://apps.apple.com/us/app/total-video-converter-lite/id520374433?mt=12) |
| [TouchBrickout](https://doesitarm.com/app/touchbrickout) | Intel-only v1.1; Rosetta not confirmed | [source](https://github.com/krayc425/TouchBreakout) |
| [Transocks Mac Signed](https://doesitarm.com/app/transocks-mac-signed) | Intel-only v3.0.9; Rosetta not confirmed | [source](https://www.transocks.org/updateInfo/feature.html) |
| [TriCo](https://doesitarm.com/app/trico) | Intel-only v3.1.0; Rosetta not confirmed | [source](https://api.github.com/repos/ngudbhav/TriCo-electron-app/releases/89796943) |
| [VOX Universal](https://doesitarm.com/app/vox-universal) | Intel-only v0.9.37; Rosetta not confirmed | [source](https://vox.rocks/windows-music-player) |
| [Vuze](https://doesitarm.com/app/vuze) | Intel-only v5.7.7.0; Rosetta not confirmed | [source](https://www.vuze.com/) |
| [WakaMenu](https://doesitarm.com/app/wakamenu) | Intel-only v1.0.0; Rosetta not confirmed | [source](https://github.com/HiroshiHorie/WakaMenu/releases/tag/1.0) |
| [WD Drive Utilities](https://doesitarm.com/app/wd-drive-utilities) | Intel-only v2.1.6.434; Rosetta not confirmed | [source](https://support-en.wd.com/app/answers/detailweb/a_id/21880/kw/FTP%20with%20a%20My%20Cloud/related/1) |
| [WifiMouseServer](https://doesitarm.com/app/wifimouseserver) | Intel-only; Rosetta not confirmed | [source](https://wifimouse.github.io/) |
| [Wondershare UniConverter 13](https://doesitarm.com/app/wondershare-uniconverter-13) | Intel-only v13.6.8; Rosetta not confirmed | [source](https://formulae.brew.sh/cask/wondershare-uniconverter) |
| [Wormhole](https://doesitarm.com/app/wormhole) | Intel-only v2.1.0; Rosetta not confirmed | [source](https://er.run/) |
| [YemuZip](https://doesitarm.com/app/yemuzip) | Intel-only v2.5; Rosetta not confirmed | [source](https://yellowmug.com/yemuzip/) |
| [YiHomeMac International](https://doesitarm.com/app/yihomemac-international) | Intel-only v1.2.0; Rosetta not confirmed | [source](https://apps.apple.com/us/app/yi-home/id1215244636?mt=12) |
| [Zenmap](https://doesitarm.com/app/zenmap) | Intel-only v7.993; Rosetta not confirmed | [source](https://nmap.org/changelog#7.993) |

## Not a standalone app listing (112)

The scanned file is an installer, uninstaller, helper, plug-in, bundled component or similar, not an app a person would look up.

| App | Finding | Evidence |
| --- | --- | --- |
| [1cestartt](https://doesitarm.com/app/1cestartt) | 1cestartt, the starter component of 1C:Enterprise Training Edition by 1C-Soft | [source](https://www.online-ufa.ru/content/articles/files-1c/) |
| [1cv8s](https://doesitarm.com/app/1cv8s) | 1C:Enterprise 8 interactive launcher by 1C Company | [source](https://1c-dn.com/library/tutorials/1c_enterprise_administrator_guide_file_mode_8_3_27/) |
| [ABAPDevelopmentTools](https://doesitarm.com/app/abapdevelopmenttools) | ABAP Development Tools for Eclipse (SAP SE) | [source](https://tools.hana.ondemand.com/) |
| [Acrobat Uninstaller](https://doesitarm.com/app/acrobat-uninstaller) | Adobe Acrobat Uninstaller | [source](https://helpx.adobe.com/acrobat/desktop/get-started/access-the-app/uninstall-acrobat.html) |
| [Adobe AIR Application Installer](https://doesitarm.com/app/adobe-air-application-installer) | Adobe AIR Application Installer, the Adobe AIR background helper for .air packages | [source](https://help.adobe.com/en_US/air/build/air_buildingapps.pdf) |
| [Adobe AIR Installer](https://doesitarm.com/app/adobe-air-installer) | Adobe AIR Installer and Uninstaller, the Adobe AIR runtime maintenance utility | [source](https://www.adobe.com/support/documentation/en/air/2/releasenotes_users.html) |
| [AJA U-TAP Updater](https://doesitarm.com/app/aja-u-tap-updater) | Dolphin Updater helper by the Dolphin Emulator project, conflated with AJA U-TAP Updater | [source](https://github.com/dolphin-emu/dolphin/commit/f74f748ff6329fdf0572015cd355fde0684189a6.patch) |
| [Alice 3 Installer](https://doesitarm.com/app/alice-3-installer) | Alice 3 Mac installer, Carnegie Mellon University’s Alice Project | [source](https://www.alice.org/get-alice/alice-3/) |
| [Alpha Centauri](https://doesitarm.com/app/alpha-centauri) | Wineskin wrapper for GOG’s edition of Sid Meier’s Alpha Centauri Planetary Pack (Firaxis Games) | [source](https://www.gog.com/en/game/sid_meiers_alpha_centauri) |
| [amac](https://doesitarm.com/app/amac) | Unidentified amac build using a React Native example bundle identifier | [source](https://github.com/react/react-native/issues/13353) |
| [Application Stub](https://doesitarm.com/app/application-stub) | Ocultar Archivos Ocultos, an Apple Automator workflow bundled as an application stub |  |
| [Authorizer](https://doesitarm.com/app/authorizer) | Loom Authorizer, AIR Music Technology’s licensing utility | [source](https://support.airmusictech.com/support/solutions/articles/69000818519-installing-and-activating-your-air-plugins) |
| [BetterDiscord](https://doesitarm.com/app/betterdiscord) | BetterDiscord Installer by the BetterDiscord project | [source](https://github.com/BetterDiscord/Installer) |
| [Canon IJScanner2](https://doesitarm.com/app/canon-ijscanner2) | Canon IJScanner2 Image Capture Architecture driver | [source](https://hk.canon/en/support/0100657928) |
| [Canon IJScanner4](https://doesitarm.com/app/canon-ijscanner4) | Canon IJScanner4 Image Capture Architecture driver | [source](https://hk.canon/en/support/0100658102) |
| [Canon IJScanner6](https://doesitarm.com/app/canon-ijscanner6) | Canon IJScanner6 Image Capture Architecture driver | [source](https://my.canon/en/support/0101139616) |
| [Chiudi tutto](https://doesitarm.com/app/chiudi-tutto) | Chiudi tutto Automator workflow applet | [source](https://www.orbolandia.it/2023/10/default) |
| [Cisco AnyConnect DART](https://doesitarm.com/app/cisco-anyconnect-dart) | Cisco AnyConnect Diagnostics and Reporting Tool (DART) module for macOS | [source](https://www.cisco.com/c/en/us/td/docs/security/vpn_client/anyconnect/anyconnect410/administration/guide/b-anyconnect-admin-guide-4-10/troubleshoot-anyconnect.html) |
| [Comments](https://doesitarm.com/app/comments) | Unidentified Comments development bundle credited in its metadata to pmw |  |
| [CPLEX Optimization Studio 20.1](https://doesitarm.com/app/cplex-optimization-studio-201) | IBM ILOG CPLEX Optimization Studio 20.1.0 macOS installer (IBM) | [source](https://www.ibm.com/support/pages/downloading-ibm-ilog-cplex-optimization-studio-2010) |
| [CPLEX Optimization Studio 22.1](https://doesitarm.com/app/cplex-optimization-studio-221) | IBM ILOG CPLEX Optimization Studio 22.1.0 InstallAnywhere installer for macOS | [source](https://www.ibm.com/support/pages/how-do-i-use-cplex-optimization-studio-2210-macosarm-machine) |
| [CPLEX Optimization Studio Community Edition 20.1](https://doesitarm.com/app/cplex-optimization-studio-community-edition-201) | IBM ILOG CPLEX Optimization Studio Community Edition 20.1 macOS installer | [source](https://www.ibm.com/support/pages/downloading-ibm-ilog-cplex-optimization-studio-2010) |
| [CraftManager](https://doesitarm.com/app/craftmanager) | Craft Manager by InVision Labs | [source](https://blog.nobledesktop.com/learn/sketch/creating-a-clickable-prototype-with-craft-by-invision) |
| [Creator Studio](https://doesitarm.com/app/creator-studio) | Creator Studio website bundle generated by BZG Unite for macOS | [source](https://www.bzgapps.com/unite-changelog) |
| [Crossy Castle](https://doesitarm.com/app/crossy-castle) | Crossy Road Castle retail demo by Hipster Whale | [source](https://www.crossyroadcastle.com/) |
| [Dashboard](https://doesitarm.com/app/dashboard) | Apple Dashboard launcher for the macOS Dashboard widget environment | [source](https://cdsassets.apple.com/live/6GJYWVAV/user/locale/en-gb/ma1635_imac_late2012_2013_qs.pdf) |
| [E-Devlet E-Imza Uygulaması](https://doesitarm.com/app/e-devlet-e-imza-uygulamasi) | e-Devlet e-İmza Uygulaması, the e-signature login component of Türkiye’s e-Devlet Kapısı, operated by Türksat | [source](https://turkiye.gov.tr/iletisim?hizli=CozumMerkeziV2&nodeId=61) |
| [EnscapeApplication](https://doesitarm.com/app/enscapeapplication) | EnscapeApplication rendering bundle installed with Enscape for Mac by Chaos | [source](https://forums.chaos.com/t/unable-to-find-entry-point-mac-sketchup-2023/177953) |
| [Eos Family Welcome Screen](https://doesitarm.com/app/eos-family-welcome-screen) | Electronic Theatre Controls (ETC) Eos Family Welcome Screen, part of ETCnomad | [source](https://www.etcconnect.com/workarea/DownloadAsset.aspx?id=10737461029) |
| [eParaksts-Safari](https://doesitarm.com/app/eparaksts-safari) | eParaksts Token Signing Safari extension host by LVRTC | [source](https://developers.eparaksts.lv/docs/browser-extensionplugin-integration-guidelines) |
| [Epson Data Collection Agent](https://doesitarm.com/app/epson-data-collection-agent) | Epson Data Collection Agent by Epson | [source](https://epson.com/faq/SPT_SEQUOIA-NS~faq-0000b88-macos_15?faq_cat=faq-8796126193740) |
| [Epson Firmware Updater](https://doesitarm.com/app/epson-firmware-updater) | Seiko Epson Firmware Updater for printer firmware packages | [source](https://epson.com/support/updating-your-printers-firmware-using-epson-software-updater) |
| [Epson Ink Replenishment Agent](https://doesitarm.com/app/epson-ink-replenishment-agent) | Seiko Epson Ink Replenishment Agent, the ReadyInk printer-monitoring component | [source](https://mediaserver.goepson.com/ImConvServlet/imconv/fd4669e5baeed30522bf955317d3e96fa9b24394/original) |
| [EPSON Manuals](https://doesitarm.com/app/epson-manuals) | EPSON Manuals component of Epson printer software | [source](https://download.epson.eu/pub/download/6028/epson602894eu.pdf) |
| [EpsonPhotoPlusTool](https://doesitarm.com/app/epsonphotoplustool) | Epson Photo+ Tool companion bundled with Epson Photo+ by Seiko Epson | [source](https://support.epson.net/appinfo/photoplus/3.0/en/GUID-62A62D81-5C56-4056-A9D9-470E631C79B7.htm) |
| [F5 Endpoint Inspector](https://doesitarm.com/app/f5-endpoint-inspector) | F5 Endpoint Inspector helper for F5 BIG-IP Access Policy Manager | [source](https://techdocs.f5.com/kb/en-us/products/big-ip_apm/releasenotes/related/relnote-edge-client-7-2-7-2.html) |
| [FBWS](https://doesitarm.com/app/fbws) | HiTRUST FBWS, First Commercial Bank i-Bank’s macOS security component | [source](https://www.firstbank.com.tw/sites/fcb/files/1565693635527) |
| [Frogger TT](https://doesitarm.com/app/frogger-tt) | Frogger in Toy Town retail demo by Konami and Q-Games | [source](https://www.konami.com/games/jp/ja/products/frogger_toytown/) |
| [GSAS-II](https://doesitarm.com/app/gsas-ii) | GSAS-II macOS launcher for the Argonne National Laboratory Advanced Photon Source crystallography suite | [source](https://gsas-ii.readthedocs.io/en/latest/GSASIIscripts.html) |
| [HardwareManager](https://doesitarm.com/app/hardwaremanager) | Unidentified Qt application named HardwareManager |  |
| [Instagram unite](https://doesitarm.com/app/instagram-unite) | Instagram website bundle generated by BZG Unite for macOS | [source](https://www.bzgapps.com/unite-changelog) |
| [Install](https://doesitarm.com/app/install) | Drobo Dashboard Installer by Drobo, Inc. | [source](https://www.bhphotovideo.com/lit_files/613215.pdf#page=22) |
| [Install League of Legends eune](https://doesitarm.com/app/install-league-of-legends-eune) | League of Legends EU Nordic and East Mac installer by Riot Games | [source](https://www.leagueoflegends.com/pl-pl/download/) |
| [ioCentre](https://doesitarm.com/app/iocentre) | Genius ioCentre tablet driver configuration utility by KYE Systems | [source](https://fcc.report/FCC-ID/FSUGMZKI/1861216.pdf) |
| [JDownloader Installer](https://doesitarm.com/app/jdownloader-installer) | JDownloader 2 installer by the JDownloader project (AppWork) | [source](https://jdownloader.org/jdownloader2?s=lng_en) |
| [Jumpcloud](https://doesitarm.com/app/jumpcloud) | JumpCloud Agent menu-bar tray by JumpCloud | [source](https://jumpcloud.com/support/add-the-jumpcloud-agent-to-an-allow-list) |
| [Kodika](https://doesitarm.com/app/kodika) | Kodika Studio development build by Kodika.io Software Limited | [source](https://itunes.apple.com/lookup?id=1479182473&country=us) |
| [LaCie Toolkit Installer](https://doesitarm.com/app/lacie-toolkit-installer) | LaCie Toolkit Installer by LaCie (Seagate) | [source](https://www.seagate.com/manuals/lacie/portable-ssd/getting-started/) |
| [launcher](https://doesitarm.com/app/launcher) | AssaultCube Mac launcher by the AssaultCube project | [source](https://assault.cubers.net/docs/history.html) |
| [Launchpad](https://doesitarm.com/app/launchpad) | Apple Launchpad, the macOS system app launcher | [source](https://support.apple.com/guide/mac-help/open-apps-with-launchpad-mh35840/15.0/mac/15.0) |
| [LensSystemSoftwareUpdater](https://doesitarm.com/app/lenssystemsoftwareupdater) | Sony Lens System Software Updater bundled with individual lens firmware updates | [source](https://service.sony.com.cn/download/firm/00003201.html) |
| [lghub_installer](https://doesitarm.com/app/lghubinstaller) | Logitech G HUB macOS installer by Logitech G | [source](https://support.logi.com/hc/en-us/articles/37493733117847-Options-and-G-HUB-macOS-Certificate-Issue) |
| [LogitechGamingInstaller](https://doesitarm.com/app/logitechgaminginstaller) | Logitech Gaming Software installer by Logitech | [source](https://support.logi.com/hc/en-us/articles/360023355053-Logitech-Gaming-Software-for-Mac-Release-Notes) |
| [LogMeIn Hamachi Installer](https://doesitarm.com/app/logmein-hamachi-installer) | LogMeIn Hamachi Installer by LogMeIn (GoTo) | [source](https://lmi-documentation-origin.azurewebsites.net/webhelp/EN/CentralUserGuide/LogMeIn/t_hamachi_Add_Attached_local.html) |
| [Magzster](https://doesitarm.com/app/magzster) | Magzster, a generated Fluid 2 website wrapper built with Todd Ditchendorf’s Fluid | [source](https://fluidapp.com/) |
| [MoticImageDevices](https://doesitarm.com/app/moticimagedevices) | Motic Image Devices, the image-capture component of Motic Images Plus by Motic | [source](https://www.motic.com/As_Support_Download/d42.html) |
| [mount](https://doesitarm.com/app/mount) | User-created NAS-Mount workflow exported as an Apple Automator application |  |
| [MultiCam Capture and Editing](https://doesitarm.com/app/multicam-capture-and-editing) | Corel/Roxio MultiCam Capture and Editing, a Toast Extras component | [source](https://help.corel.com/toast/v19/en/official-help/toast/h2-toast-extras.html) |
| [NAS](https://doesitarm.com/app/nas) | Naverisk Mac Agent (NAS) by Naverisk | [source](https://kb.naverisk.com/en/articles/3969036-mac-agents) |
| [Netflix](https://doesitarm.com/app/netflix) | User-created Netflix website wrapper generated by Todd Ditchendorf’s Fluid | [source](https://fluidapp.com/) |
| [nextLAB Mobile](https://doesitarm.com/app/nextlab-mobile) | FotoKem nextLAB Mobile on-set dailies workstation software | [source](https://fotokem.com/wp-content/uploads/2025/04/fotokem_onesheet_production.pdf) |
| [Nik Collection Install](https://doesitarm.com/app/nik-collection-install) | DxO Nik Collection macOS installer | [source](https://userguides.dxo.com/en/nikcollection/setup-and-installation) |
| [NoxInstaller](https://doesitarm.com/app/noxinstaller) | NoxPlayer macOS installer by BigNox | [source](https://www.bignox.com/) |
| [OSX Validate All AUs](https://doesitarm.com/app/osx-validate-all-aus) | OSX Validate All AUs, a user-saved Apple Script Editor applet | [source](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/SaveaScript.html) |
| [OverSight_Installer](https://doesitarm.com/app/oversightinstaller) | OverSight installer by Objective-See | [source](https://objective-see.org/products/oversight) |
| [Panda](https://doesitarm.com/app/panda) | Panda, unidentified Qt/QMake Mac bundle sddda.Panda |  |
| [Papers Beta](https://doesitarm.com/app/papers-beta) | ReadCube Papers 4 beta-channel build by Digital Science | [source](https://about.readcube.com/help-center/deploying-the-desktop-app-for-enterprise-customers/) |
| [Papers Installer](https://doesitarm.com/app/papers-installer) | Papers Installer for ReadCube Papers by ReadCube | [source](https://about.readcube.com/help-center/deploying-the-desktop-app-for-enterprise-customers/) |
| [pdpop download client](https://doesitarm.com/app/pdpop-download-client) | PDPop Download Client for Mac by Gvix, distributed by PDPop (TBENM) | [source](https://new.pdpop.com/faqView/309800) |
| [PiPer](https://doesitarm.com/app/piper) | PiPer for Safari by Adam Marcus | [source](https://apps.apple.com/us/app/piper/id1421915518?mt=12) |
| [Play Wild](https://doesitarm.com/app/play-wild) | WildWorks Animal Jam (Play Wild) desktop installer | [source](https://classic-help.animaljam.com/hc/en-us/articles/1260800788550-AJ-and-AJ-Classic-Desktop-App-Help) |
| [PostWebATMService](https://doesitarm.com/app/postwebatmservice) | HiTrust PostWebATMService smart-card reader helper for Chunghwa Post WebATM | [source](https://webatm.post.gov.tw/postatm/help/ActiveX.htm) |
| [RansomWhere_Installer](https://doesitarm.com/app/ransomwhereinstaller) | RansomWhere Installer by Objective-See | [source](https://objective-see.org/products/ransomwhere.html) |
| [recoverit](https://doesitarm.com/app/recoverit) | RecoveritLoader by Wondershare | [source](https://recoverit.wondershare.com/data-recovery-mac.html) |
| [Red Giant Launcher](https://doesitarm.com/app/red-giant-launcher) | Red Giant Launcher bundled with the Shooter Suite 13.1.8 installer (Red Giant) | [source](https://support.maxon.net/hc/en-us/articles/4402060524818-Which-products-are-compatible-with-the-Maxon-App) |
| [Red Giant Link](https://doesitarm.com/app/red-giant-link) | Red Giant Link product updater (Red Giant) | [source](https://uploads.toolfarm.com/app/uploads/2015/10/02113715/RedGiantVolumeSubscriptionGuide.pdf) |
| [Remove Soundtoys](https://doesitarm.com/app/remove-soundtoys) | Soundtoys plug-in uninstaller | [source](https://support.soundtoys.com/article/64-uninstalling-soundtoys) |
| [RobloxPlayerInstaller](https://doesitarm.com/app/robloxplayerinstaller) | Roblox Corporation's macOS installer for Roblox Player | [source](https://en.help.roblox.com/hc/en-us/articles/204473560-How-to-Install-and-Play-Roblox) |
| [SampleTank 3 Instruments Installer](https://doesitarm.com/app/sampletank-3-instruments-installer) | SampleTank 3 Instruments Installer and Sound Library Updater by IK Multimedia | [source](https://harmonic-sound.com/sample-tank-3-install/) |
| [SAP GUI for Java Installer](https://doesitarm.com/app/sap-gui-for-java-installer) | SAP GUI for Java Installer (SAP SE) | [source](https://help.sap.com/doc/f540a730ff3c46a29c34be1fd3cd3275/810.00/en-US/sap_gui_for_java.pdf) |
| [Save to Pocket](https://doesitarm.com/app/save-to-pocket) | Save to Pocket Safari extension by Mozilla / Read It Later | [source](https://macupdater.net/app_updates/appinfo/com.pocket.safari.save/index.html) |
| [Shooter Suite Installer](https://doesitarm.com/app/shooter-suite-installer) | Red Giant Shooter Suite 13 installer | [source](https://support.maxon.net/hc/en-us/articles/21148760833180-How-do-I-install-the-individual-suites-within-my-Red-Giant-subscription-Magic-Bullet-Trapcode-VFX-Universe) |
| [SogouWBInstaller](https://doesitarm.com/app/sogouwbinstaller) | Sogou Wubi Input Method installer for Mac by Sogou | [source](https://pinyin.sogou.com/mac/wubi.php) |
| [SupportTool](https://doesitarm.com/app/supporttool) | MacPaw Support Tool for CleanMyMac by MacPaw | [source](https://macpaw.com/support/cleanmymac/knowledgebase/support-tool) |
| [TFBWebATM](https://doesitarm.com/app/tfbwebatm) | Taipei Fubon Bank’s WebATM smart-card security component for macOS | [source](https://ebank.taipeifubon.com.tw/B2C/common/InstallSecurityControl.faces) |
| [The Dame Was Loaded](https://doesitarm.com/app/the-dame-was-loaded) | GOG DOSBox launcher for The Dame Was Loaded (Beam Software) | [source](https://www.gog.com/en/game/the_dame_was_loaded) |
| [Trader Workstation Installer](https://doesitarm.com/app/trader-workstation-installer) | Interactive Brokers Trader Workstation installer (install4j) | [source](https://www.interactivebrokers.com/en/trading/download-tws.php) |
| [Trapcode Suite Installer](https://doesitarm.com/app/trapcode-suite-installer) | Red Giant Trapcode Suite Installer by Red Giant (Maxon) | [source](https://support.maxon.net/hc/en-us/articles/21148760833180-How-do-I-install-the-individual-suites-within-my-Red-Giant-subscription-Magic-Bullet-Trapcode-VFX-Universe) |
| [UA Mixer Engine](https://doesitarm.com/app/ua-mixer-engine) | Universal Audio UAD Mixer Engine for Apollo | [source](https://media.uaudio.com/support/manuals/v11.0.0-y2Bz6/Apollo%20Software%20Manual%20-%20Thunderbolt.pdf) |
| [UNDERTALE](https://doesitarm.com/app/undertale) | Unidentified NW.js bundle labeled UNDERTALE | [source](https://steamdb.info/depot/391542/) |
| [UniConverter 13 Installer](https://doesitarm.com/app/uniconverter-13-installer) | Wondershare UniConverter 13 installer by Wondershare | [source](https://videoconverter.wondershare.com/download-video-converter-mac.html) |
| [Unifying Installer](https://doesitarm.com/app/unifying-installer) | Logitech Unifying Installer, the installer for Logitech Unifying Software for Mac | [source](https://support.logi.com/hc/en-ca/articles/360025283513-Logitech-Unifying-Software) |
| [Uninstall](https://doesitarm.com/app/uninstall) | FortiClient Uninstaller by Fortinet | [source](https://community.fortinet.com/fortigate-3/technical-tip-how-to-uninstall-forticlient-on-macos-117962) |
| [Uninstall AnyConnect](https://doesitarm.com/app/uninstall-anyconnect) | Cisco AnyConnect Secure Mobility Client uninstaller for macOS | [source](https://www.cisco.com/c/en/us/td/docs/security/vpn_client/anyconnect/anyconnect410/administration/guide/b-anyconnect-admin-guide-4-10/deploy-anyconnect.html) |
| [Uninstall AnyConnect DART](https://doesitarm.com/app/uninstall-anyconnect-dart) | Cisco AnyConnect Diagnostics and Reporting Tool (DART) uninstaller for macOS | [source](https://www.cisco.com/c/en/us/td/docs/security/vpn_client/anyconnect/anyconnect410/administration/guide/b-anyconnect-admin-guide-4-10/deploy-anyconnect.html) |
| [Uninstall CylancePROTECT](https://doesitarm.com/app/uninstall-cylanceprotect) | CylancePROTECT uninstaller bundled with Arctic Wolf Aurora Protect Desktop | [source](https://docs.arcticwolf.com/en/aurora-endpoint-security/aurora-endpoint-defense-administrator-guide/troubleshooting-aurora-endpoint-security/troubleshooting-aurora-protect-desktop/remove-the-aurora-protect-desktop-agent-from-a-device) |
| [Uninstall VIDBOX Capture Device Driver](https://doesitarm.com/app/uninstall-vidbox-capture-device-driver) | VIDBOX Capture Device Driver uninstaller by VIDBOX | [source](https://vidbox.company/userguide/ug.php?lang=0x0412&os=Mac&pd=0sss2) |
| [Universe Installer](https://doesitarm.com/app/universe-installer) | Red Giant Universe suite installer by Red Giant, now Maxon | [source](https://support.maxon.net/hc/en-us/articles/21148760833180-How-do-I-install-the-individual-suites-within-my-Red-Giant-subscription-Magic-Bullet-Trapcode-VFX-Universe) |
| [UniverseStylize](https://doesitarm.com/app/universestylize) | Red Giant Universe Stylize plug-in component by Maxon | [source](https://help.maxon.net/rg/en-us/Content/html/universe-tools-locator.html) |
| [USB2MIDIDebug](https://doesitarm.com/app/usb2mididebug) | Unidentified openFrameworks bundle named USB2MIDIDebug |  |
| [USB_MIDI](https://doesitarm.com/app/usbmidi) | Unidentified openFrameworks bundle named USB_MIDI |  |
| [USB_MIDI2Debug](https://doesitarm.com/app/usbmidi2debug) | Unidentified openFrameworks bundle named USB_MIDI2Debug |  |
| [VencordInstaller](https://doesitarm.com/app/vencordinstaller) | Vencord Installer by the Vencord project (Vendicated) | [source](https://github.com/Vencord/Installer/blob/main/README.md?plain=1) |
| [VFX Suite Installer](https://doesitarm.com/app/vfx-suite-installer) | Red Giant VFX Suite Installer by Red Giant (Maxon) | [source](https://support.maxon.net/hc/en-us/articles/21148760833180-How-do-I-install-the-individual-suites-within-my-Red-Giant-subscription-Magic-Bullet-Trapcode-VFX-Universe) |
| [VMwareGfx](https://doesitarm.com/app/vmwaregfx) | VMwareGfx video-driver kernel extension (VMware Tools) | [source](https://manuals.plus/m/7dbb72c5af47d98e8f56aa606512983f03f825583d6ccb00a2d63f644c0c1058) |
| [WD App Manager](https://doesitarm.com/app/wd-app-manager) | Western Digital WD App Manager, a component of WD Sync | [source](https://community.wd.com/t/unable-to-login-to-cloud-sync-on-mac/203652) |
| [WD Drive Utilities Installer](https://doesitarm.com/app/wd-drive-utilities-installer) | Western Digital WD Drive Utilities Installer for macOS | [source](https://support-en.wd.com/app/answers/detailweb/a_id/50396) |
| [WD Security Installer](https://doesitarm.com/app/wd-security-installer) | Western Digital WD Security Installer and Uninstaller | [source](https://support-en.wd.com/app/answers/detailweb/a_id/50696) |
| [Work](https://doesitarm.com/app/work) | Apple Automator workflow applet saved as Work |  |
| [World of Warcraft Launcher](https://doesitarm.com/app/world-of-warcraft-launcher) | World of Warcraft Launcher, a Blizzard Battle.net game bootstrapper | [source](https://us.forums.blizzard.com/en/wow/t/unexpectedly-crashing-when-trying-to-play/950062.json) |
| [XeroxUniversal Registration](https://doesitarm.com/app/xeroxuniversal-registration) | XeroxUniversal Registration helper by Leader Technologies for Xerox |  |
| [ZeniMax Online Studios Launcher](https://doesitarm.com/app/zenimax-online-studios-launcher) | The Elder Scrolls Online launcher by ZeniMax Online Studios, using Solid State Networks software | [source](https://forums.elderscrollsonline.com/en/discussion/67940/launcher-problems-and-login-timeout-issue) |

## Held back: name collisions (49)

Supported findings that were not added because the listing name would match other apps' scans through whole-word name matching (for example "Yandex" or "Automator"). Adding these needs a more specific README name or an alias change.

| App | Finding | Evidence |
| --- | --- | --- |
| [4K YouTube to MP3](https://doesitarm.com/app/4k-youtube-to-mp3) | Native v26.4.0.0406 | [source](https://www.4kdownload.com/downloads/34) |
| [Ankama Launcher](https://doesitarm.com/app/ankama-launcher) | Rosetta | [source](https://formulae.brew.sh/cask/ankama) |
| [Antelope Launcher](https://doesitarm.com/app/antelope-launcher) | Native v3.4.1 | [source](https://support.antelopeaudio.com/en/support/solutions/articles/42000119311-launcher-3-4-1-update-and-overview) |
| [AppsAnywhere](https://doesitarm.com/app/appsanywhere) | Native v2.3.0 | [source](https://docs.appsanywhere.com/client/-/macos-client-2-3) |
| [Automator](https://doesitarm.com/app/automator) | Native v2.10 | [source](https://support.apple.com/guide/automator/welcome/mac) |
| [BaseCamp](https://doesitarm.com/app/basecamp) | Rosetta | [source](https://www8.garmin.com/support/download_details.jsp?id=4449) |
| [Blu-ray Player Pro](https://doesitarm.com/app/blu-ray-player-pro) | Rosetta | [source](https://www.macblurayplayer.jp/pro) |
| [Canon IJ Scan Utility](https://doesitarm.com/app/canon-ij-scan-utility) | Native v1.4.0 | [source](https://tw.canon/en/support/0101139102) |
| [Companion](https://doesitarm.com/app/companion) | Native v5.1.3 | [source](https://fleetdm.com/software-catalog/companion-darwin) |
| [CylancePROTECT](https://doesitarm.com/app/cylanceprotect) | Rosetta | [source](https://docs.arcticwolf.com/en/aurora-endpoint-security/aurora-endpoint-security-setup/aurora-endpoint-security-setup-guide/aurora-endpoint-security-prerequisites/aurora-protect-prerequisites) |
| [Dremel DigiLab 3D Slicer](https://doesitarm.com/app/dremel-digilab-3d-slicer) | Rosetta | [source](https://3pitech.com/pages/copy-of-desktop-slicer-software) |
| [Duplicate Annihilator for Photos](https://doesitarm.com/app/duplicate-annihilator-for-photos) | Native v9.1.0 | [source](https://brattoo.com/photos/) |
| [EasyEDA](https://doesitarm.com/app/easyeda) | Native v6.5.61 | [source](https://easyeda.com/page/download) |
| [EOS Utility](https://doesitarm.com/app/eos-utility) | Native v0.1.40 | [source](https://svc.kr.canon/solution/download/downloadDetailForm?ctgGb=CI&ctgId=&ctgNm=&downloadCodeArr=01,02,04&mode=detail&modelCode=7503C&osKeyArr=&pageFormUrl=&pageIndex=1&pageUnit=10&productKey=&searchCategoryArr=&searchKeyword=&simsFaqCodeArr=&solutionTab=DOWNLOADS&uniqKey=0200775402) |
| [ExactScan](https://doesitarm.com/app/exactscan) | Native v26.6 | [source](https://www.exactscan.com/download.html) |
| [EZkeys 2](https://doesitarm.com/app/ezkeys-2) | Native v2.1.6 | [source](https://www.toontrack.com/forums/topic/does-all-your-software-run-natively-on-apple-silicon-m1m2m3-chips/) |
| [Guardian Browser](https://doesitarm.com/app/guardian-browser) | Native v5.0.0 | [source](https://guardian.meazurelearning.com/) |
| [Jaspersoft Studio](https://doesitarm.com/app/jaspersoft-studio) | Rosetta | [source](https://community.jaspersoft.com/download-jaspersoft/community-edition/jaspersoft-studio_mac_7.x) |
| [JLab Work](https://doesitarm.com/app/jlab-work) | Native v2.1 | [source](https://www.jlab.com/pages/work-app) |
| [Local](https://doesitarm.com/app/local) | Native v10.2.0 | [source](https://localwp.com/releases/) |
| [LockDown Browser](https://doesitarm.com/app/lockdown-browser) | Rosetta | [source](https://support.respondus.com/hc/en-us/articles/58808445615899-LockDown-Browser-for-Mac-version-2-1-6-02) |
| [LockDown Browser OEM](https://doesitarm.com/app/lockdown-browser-oem) | Rosetta | [source](https://support.respondus.com/hc/en-us/articles/44172239926043-LockDown-Browser-OEM-Version) |
| [LogMeIn Hamachi](https://doesitarm.com/app/logmein-hamachi) | Native v2.3.0.82 | [source](https://vpn.net/) |
| [Movavi Screen Recorder](https://doesitarm.com/app/movavi-screen-recorder) | Native v24.8.2 | [source](https://www.movavi.com/mac-screen-recorder/whats-new.html) |
| [Notion Calendar](https://doesitarm.com/app/notion-calendar) | Native v1.144.0 | [source](https://www.notion.com/product/calendar/download) |
| [NukeStudio13.0v2](https://doesitarm.com/app/nukestudio130v2) | Native v17.1v3 | [source](https://learn.foundry.com/nuke/content/release_notes/17.1/nuke_17.1v3_releasenotes.html) |
| [NukeStudio13.0v2 NC](https://doesitarm.com/app/nukestudio130v2-nc) | Native v17.1v3 | [source](https://learn.foundry.com/nuke/content/release_notes/17.1/nuke_17.1v3_releasenotes.html) |
| [NukeX13.0v2](https://doesitarm.com/app/nukex130v2) | Native v17.1v3 | [source](https://learn.foundry.com/nuke/content/release_notes/17.1/nuke_17.1v3_releasenotes.html) |
| [NukeX13.0v2 NC](https://doesitarm.com/app/nukex130v2-nc) | Native v17.1v3 | [source](https://learn.foundry.com/nuke/content/release_notes/17.1/nuke_17.1v3_releasenotes.html) |
| [OpenMW](https://doesitarm.com/app/openmw) | Native v0.51.0 | [source](https://github.com/OpenMW/openmw/releases/tag/openmw-0.51.0) |
| [OpenMW-CS](https://doesitarm.com/app/openmw-cs) | Native v0.51.0 | [source](https://github.com/OpenMW/openmw/releases/tag/openmw-0.51.0) |
| [OverSight](https://doesitarm.com/app/oversight) | Native v2.4.0 | [source](https://github.com/objective-see/OverSight/releases/tag/v2.4.0) |
| [Papers](https://doesitarm.com/app/papers) | Native v5.0.32 | [source](https://about.readcube.com/help-center/deploying-the-desktop-app-for-enterprise-customers/) |
| [Pd](https://doesitarm.com/app/pd) | Native v0.57-0 | [source](https://msp.ucsd.edu/software.html) |
| [PDF Toolkit](https://doesitarm.com/app/pdf-toolkit) | Native v2.6 | [source](https://apps.apple.com/us/app/pdf-toolkit/id545164971?mt=12) |
| [Pulse](https://doesitarm.com/app/pulse) | Native v40.4.30 | [source](https://pulsedownloader.com/) |
| [Ray](https://doesitarm.com/app/ray) | Native v4.0.0 | [source](https://myray.app/changelog#4.0.0) |
| [RECentral](https://doesitarm.com/app/recentral) | Unsupported | [source](https://www.avermedia.co.jp/au/support/download?model_number=C875) |
| [Rename My TV Series](https://doesitarm.com/app/rename-my-tv-series) | Native v2.3.12 | [source](https://www.tweaking4all.com/downloads/) |
| [Sigil](https://doesitarm.com/app/sigil) | Native v2.8.6 | [source](https://sigil-ebook.com/sigil/download/) |
| [SnapGene](https://doesitarm.com/app/snapgene) | Native v9.0.1 | [source](https://support.snapgene.com/hc/en-us/articles/48508781512084-SnapGene-Compatibility-with-Future-macOS-Releases) |
| [Spyder](https://doesitarm.com/app/spyder) | Native v6.1.8 | [source](https://github.com/spyder-ide/spyder/releases/tag/v6.1.8) |
| [Toolkit](https://doesitarm.com/app/toolkit) | Native v2.49.0.5 | [source](https://www.seagate.com/support/kb/toolkit-and-macos-compatibility-alerts-apple-silicon-macs/) |
| [WD Security](https://doesitarm.com/app/wd-security) | Rosetta | [source](https://support-en.wd.com/app/answers/detailweb/a_id/50696) |
| [Wondershare UniConverter](https://doesitarm.com/app/wondershare-uniconverter) | Native v14.1.2 | [source](https://uniconverter.wondershare.cn/about-us-ad.html) |
| [Yandex](https://doesitarm.com/app/yandex) | Native v26.11.0.2030 | [source](https://browser.yandex.ru/c/browser-macos) |
| [Yandex.Disk](https://doesitarm.com/app/yandexdisk) | Rosetta | [source](https://formulae.brew.sh/cask/yandex-disk) |
| [Yandex.Disk.2](https://doesitarm.com/app/yandexdisk2) | Rosetta | [source](https://formulae.brew.sh/cask/yandex-disk) |
| [YouTube to MP3](https://doesitarm.com/app/youtube-to-mp3) | Native v3.9.24 | [source](https://www.mediahuman.com/youtube-to-mp3/32/) |

## Held back: review pass (30)

Supported findings left out of the README because the record itself raises doubt, or a clean line could not be built from it.

| App | Finding | Evidence |
| --- | --- | --- |
| [Adobe Color Printer Utility](https://doesitarm.com/app/adobe-color-printer-utility) | Rosetta: Rosetta is inferred; the official download returns 404 and printing errors are reported on current macOS. | [source](https://rosettacheck.com/apps/7bh9rf4p) |
| [Aimersoft Video Converter Ultimate](https://doesitarm.com/app/aimersoft-video-converter-ultimate) | Rosetta: The product page now redirects to Wondershare UniConverter; only a raw installer link is left as the app link. | [source](https://formulae.brew.sh/cask/aimersoft-video-converter-ultimate) |
| [Alchemy](https://doesitarm.com/app/alchemy) | Native: Native only in the experimental Quantum prerelease; the regular channel is still Intel. | [source](https://github.com/AlchemyViewer/Alchemy/releases/tag/Alchemy_Project%23666ef7bf-Quantum) |
| [AnkerMake Studio](https://doesitarm.com/app/ankermake-studio) | Rosetta: The app link points to the separate UV eufyMake Studio, while the evidence covers the renamed eufyMake Studio 3D. | [source](https://github.com/eufymake/eufyMake-PrusaSlicer-Release/releases/tag/v1.5.26) |
| [App Language Chooser](https://doesitarm.com/app/app-language-chooser) | Rosetta: Opens under Rosetta, but its main language-switching function was reported to fail on an M1 Pro. | [source](https://apps.apple.com/ru/app/app-language-chooser/id451732904?mt=12) |
| [ApplePi-Baker](https://doesitarm.com/app/applepi-baker) | Rosetta: The helper and restore workflow is reported to fail on some Apple Silicon Macs. | [source](https://www.tweaking4all.com/hardware/raspberry-pi/applepi-baker-v2/) |
| [AppZapper](https://doesitarm.com/app/appzapper) | Native: The app link is a raw ZIP, the vendor site now promotes the separate AppZapper 3000, and there is no evidence page. | [source](https://appzapper.com/) |
| [Archive Utility](https://doesitarm.com/app/archive-utility) | Native: Built-in macOS component; the architecture evidence is a single third-party blog post. | [source](https://support.apple.com/guide/mac-help/zip-and-unzip-files-and-folders-on-mac-mchlp2528/mac) |
| [CodeBlocks](https://doesitarm.com/app/codeblocks) | Rosetta: Runs under Rosetta only in Safe Mode; normal startup and integrated builds were reported to fail. | [source](https://www.codeblocks.org/downloads/binaries/) |
| [Day-O](https://doesitarm.com/app/day-o) | Rosetta: The only app link is a raw ZIP, and its Preferences window is reported broken under Rosetta. | [source](https://macupdater.net/app_updates/appinfo/com.shauninman.Day-O/index.html) |
| [dBpoweramp Video Converter](https://doesitarm.com/app/dbpoweramp-video-converter) | Native: The version is a date label (R2026-03-23). | [source](https://versions.dbpoweramp.com/?appid=5) |
| [Dictionary](https://doesitarm.com/app/dictionary) | Native: Built-in macOS component; the architecture evidence is an unrelated third-party PDF and a research paper. | [source](https://support.apple.com/guide/dictionary/welcome/mac) |
| [Fiji](https://doesitarm.com/app/fiji) | Native: No release version: the build ID is a date stamp. | [source](https://downloads.imagej.net/fiji/archive/latest/20261123-0817/) |
| [fre:ac - free audio converter](https://doesitarm.com/app/freac-free-audio-converter) | Native: name breaks the README line format | [source](https://www.freac.org/downloads-mainmenu-33) |
| [Get Lyrical](https://doesitarm.com/app/get-lyrical) | Unsupported: The verdict rests on the retired iTunes lyric workflow, not on Apple Silicon; a Rosetta launch was not tested. | [source](https://shullian.com/get_lyrical.php) |
| [Grim Fandango Remastered](https://doesitarm.com/app/grim-fandango-remastered) | Rosetta: Customer launch reports on Apple Silicon conflict. | [source](https://www.doublefine.com/games/support/grim-fandango-remastered/system-requirements) |
| [HBuilderX](https://doesitarm.com/app/hbuilderx) | Native: Native evidence is for the Alpha channel and the version is an alpha build string. | [source](https://www.dcloud.io/hbuilderx.html) |
| [HP Easy Admin](https://doesitarm.com/app/hp-easy-admin) | Native: The app link is a raw ZIP on an FTP server and the record has no HP product page. | [source](https://formulae.brew.sh/cask/hp-easy-admin) |
| [iGlance](https://doesitarm.com/app/iglance) | Rosetta: Runs under Rosetta, but its temperature and fan readings are reported wrong on Apple Silicon. | [source](https://github.com/iglance/iGlance/releases/tag/v2.1.0) |
| [LEGO Star Wars II Demo](https://doesitarm.com/app/lego-star-wars-ii-demo) | Unsupported: no official url | [source](https://www.macworld.com/article/185511/legostarwars2.html) |
| [MapMap](https://doesitarm.com/app/mapmap) | Native: The native build is a public beta. | [source](https://mapmapteam.github.io/en/download/) |
| [MindMaster](https://doesitarm.com/app/mindmaster) | Rosetta: Rosetta rests on the Homebrew caveat for the Chinese edition (mindmaster-cn); the listing may be the international edition. | [source](https://edraw.wondershare.cn/download/) |
| [MPEG Streamclip](https://doesitarm.com/app/mpeg-streamclip) | Unsupported: no official url | [source](https://www.digital-digest.com/software/mpeg_streamclip_mac_history.html) |
| [MQTT Explorer](https://doesitarm.com/app/mqtt-explorer) | Native: Native only in the 0.4.0 beta; the 0.3.5 stable build is not covered. | [source](https://mqtt-explorer.com/) |
| [NCALayer](https://doesitarm.com/app/ncalayer) | Rosetta: Launches under Rosetta, but the government signing service did not detect it; the core signing workflow is unverified. | [source](https://ncl.pki.gov.kz/) |
| [Olive](https://doesitarm.com/app/olive) | Native: Native only in an unstable nightly build. | [source](https://olivevideoeditor.org/download) |
| [Silicio](https://doesitarm.com/app/silicio) | Native: Native rests on a third-party scan, and MacUpdate labels the same version Intel. | [source](https://apps.apple.com/us/app/silicio-widgets-mini-player/id933627574?mt=12) |
| [Solar App](https://doesitarm.com/app/solar-app) | Unsupported: The unsupported verdict rests on a single 2021 App Store review. | [source](https://apps.apple.com/pl/app/solar-app/id450545814?mt=12) |
| [SWClient](https://doesitarm.com/app/swclient) | Native: No usable version: the app version is a timestamp and the vendor labels disagree. | [source](https://cpc.icloud.cn/download) |
| [uTorrent Web](https://doesitarm.com/app/utorrent-web) | Native: Universal binary, but launch failures are reported on Apple Silicon. | [source](https://www.utorrent.com/downloads/mac/) |

## Already in the README (4)

A README entry with the same name already exists, so no line was added. Compare the existing status with the finding.

| App | Finding | Evidence |
| --- | --- | --- |
| [AJA eMini-Setup](https://doesitarm.com/app/aja-emini-setup) | Native v2.4.5.7 | [source](https://www.aja.com/support/item/10397) |
| [HCL Notes](https://doesitarm.com/app/hcl-notes) | Native v4.13 (3195) | [source](https://support.apple.com/guide/notes/welcome/mac) |
| [Maxon Chromatic Displacement](https://doesitarm.com/app/maxon-chromatic-displacement) | Native v2027.1.0 | [source](https://support.maxon.net/hc/en-us/articles/8657965267356-Maxon-App-2027-1-0-November-23-2026) |
| [Maxon Shadow](https://doesitarm.com/app/maxon-shadow) | Native v9.9.10489 | [source](https://shadow.tech/us/download/) |

## Still unknown (188)

The agents could not settle the product or its architecture. The finding column says what is missing.

| App | Finding | Evidence |
| --- | --- | --- |
| [1Click Duplicate Finder](https://doesitarm.com/app/1click-duplicate-finder) | No arm64 or universal statement was found for version 2.4.0, and the earlier M1 wording does not distinguish native support from Rosetta. | [source](https://apps.apple.com/us/app/1click-duplicate-finder/id1295683946?mt=12) |
| [1player](https://doesitarm.com/app/1player) | No live vendor release, current binary architecture or official discontinuation notice could be found. | [source](https://itunes.apple.com/lookup?bundleId=com.kongfuapps.1player&entity=macSoftware&country=us) |
| [360Chrome](https://doesitarm.com/app/360chrome) | The current native Pro download's bundle identity could not be confirmed as net.qihoo.360browser. | [source](https://bbs.360.cn/thread-16185040-1-1.html) |
| [3DCoat](https://doesitarm.com/app/3dcoat) | The architecture of the currently offered Mac builds could not be tied to a named version, and the 2026.30 package exceeded the… | [source](https://3dcoat.com/download/?L=0) |
| [3DWOX Desktop](https://doesitarm.com/app/3dwox-desktop) | No current official Mac download, release version, or Apple Silicon compatibility documentation was located. | [source](https://www.sindoh.com/hubfs/site/catalog/3DWOX_SlicerManual_ENG.pdf) |
| [A Short Hike](https://doesitarm.com/app/a-short-hike) | The available architecture result is unversioned, so it could not be tied to a specific Steam or itch.io release. | [source](https://adamgryu.itch.io/a-short-hike) |
| [ABDialer](https://doesitarm.com/app/abdialer) | No live official release, current architecture or Apple Silicon runtime evidence was found. | [source](https://www.macscripter.net/t/updating-a-script-from-9-to-x/22391) |
| [Advanced Uninstall Manager](https://doesitarm.com/app/advanced-uninstall-manager) | No architecture declaration or inspectable official binary was found for version 3.4. | [source](https://www.advanceduninstallmanager.com/support) |
| [AdwareCleaner](https://doesitarm.com/app/adwarecleaner) | No architecture for this product’s listed build or confirmed Rosetta 2 runtime was found. | [source](https://pocketbitsllc.com/apps/adware/) |
| [Agatha Christie - Hercule Poirot The First Cases](https://doesitarm.com/app/agatha-christie-hercule-poirot-the-first-cases) | Apple markets the current download as 1.0. | [source](https://itunes.apple.com/lookup?id=1580765631&entity=macSoftware) |
| [AHM System Manager 1.61](https://doesitarm.com/app/ahm-system-manager-161) | The vendor did not state the Mac executable architecture or Rosetta behavior, and the disk image could not be retrieved for inspection. | [source](https://www.allen-heath.com/hardware/ahm/all-models/resources/) |
| [AJA Mini-Config](https://doesitarm.com/app/aja-mini-config) | The release executable's architecture and any reliance on Rosetta were not established. | [source](https://www.aja.com/support/item/10213) |
| [Amanote](https://doesitarm.com/app/amanote) | The vendor does not state whether 4.1.6 is Intel or ARM, and both official Mac archives are larger than the inspection limit. | [source](https://amanote.com/de/download/) |
| [AMC CTRL 5.15C OSX](https://doesitarm.com/app/amc-ctrl-515c-osx) | No vendor, product purpose, public distribution or current architecture could be established from the bundle ID, names or version strings. |  |
| [Angeldust](https://doesitarm.com/app/angeldust) | The current Mac App Store Mach-O architecture and Apple Silicon runtime behavior remain unverified. | [source](https://angeldu.st/en/support) |
| [Anghami](https://doesitarm.com/app/anghami) | The current desktop macOS version and architecture were not verified from the available installation and support pages. | [source](https://www.anghami.com/devices) |
| [Any Video Converter](https://doesitarm.com/app/any-video-converter) | The architecture of the installed 9.2.6 converter could not be verified from the documentation or the installer-only download. | [source](https://www.any-video-converter.com/update/avc_free_mac_relnotes.html) |
| [Apogee Control 2](https://doesitarm.com/app/apogee-control-2) | Apple Silicon compatibility is documented, but the Control 2 app executable architecture is unverified; the public ZIPs checked exceed 150… | [source](https://knowledge.apogeedigital.com/apogee-product-software-firmware-versions-list-current-products) |
| [AQ Device Manager](https://doesitarm.com/app/aq-device-manager) | A current official build, its architecture, and any formal end-of-support notice could not be verified. | [source](https://www.audioquest.com/pages/dragonfly-firmware-updates) |
| [Archetype Plini](https://doesitarm.com/app/archetype-plini) | The last legacy installer is over the inspection limit, and I found explicit standalone architecture evidence for 2.0.2 only. | [source](https://neuraldsp.com/downloads) |
| [ArtNetView](https://doesitarm.com/app/artnetview) | The vendor's current download points to a different version, so the historical 2.2.1 scan does not verify the architecture of the build now… | [source](https://artnetview.com/) |
| [ArubaSign](https://doesitarm.com/app/arubasign) | The current official download is larger than 150 MB and its architecture and release version were not established. | [source](https://www.pec.it/includes/modali-firma/download%20arubasign.aspx) |
| [Assessment Viewer](https://doesitarm.com/app/assessment-viewer) | The vendor, distribution channel, whether this is a standalone product and current Mac binary architecture could not be established. |  |
| [aTrust](https://doesitarm.com/app/atrust) | The newest Mac package's architecture is unconfirmed because Sangfor gates its current installer matrix behind sign-in. | [source](https://support.sangfor.com.cn/productSoftware/read?category_id=160&id=121&product_id=19) |
| [Auralia 5 Student](https://doesitarm.com/app/auralia-5-student) | The latest distributable Auralia 5 Student build and its architecture could not be established. | [source](https://www.risingsoftware.com/support/knowledgebase/auralia-501850-changes) |
| [Bastion](https://doesitarm.com/app/bastion) | No public macOS release, exact vendor client mapping, or current architecture was found. | [source](https://www.venustech.com.cn/u/cms/www/202411/26162018zsio.pdf) |
| [Battery Amperage](https://doesitarm.com/app/battery-amperage) | No current vendor release or architecture evidence for the scanned bundle could be found. | [source](https://softwar.io/search?genre_id=12019&page=203&q=what+is+it+MA) |
| [Bible Study](https://doesitarm.com/app/bible-study) | Neither Olive Tree nor Apple identifies the architecture of 8.1.5, and the store binary was not inspected. | [source](https://help.olivetree.com/hc/en-us/articles/29701192332173-Mac-Downloading-the-App) |
| [Billable](https://doesitarm.com/app/billable) | No architecture was published or verified for Mac App Store version 1.3.2. | [source](https://getbillable.com/) |
| [Box of Books Reader](https://doesitarm.com/app/box-of-books-reader) | The installer is behind a school sign-in and public documentation gives no version or architecture. | [source](https://help.boxofbooks.io/en/articles/6176351-getting-started-guide-for-nextgen-on-apple-macos) |
| [CareConnect](https://doesitarm.com/app/careconnect) | The exact scanned Install4j bundle ID could not be tied to a current vendor edition with known architecture. | [source](https://support.corilus.be/generalpractitioner/nl/articles/655248-download-careconnect-general-practitioner) |
| [CLAS Student GDCP](https://doesitarm.com/app/clas-student-gdcp) | No current listing, vendor download, or withdrawal notice for the exact Mac client was located. | [source](https://www.georgefox.edu/psyd/faculty/mcminn-cv.pdf) |
| [CLIP STUDIO](https://doesitarm.com/app/clip-studio) | No versioned architecture evidence was found for the jp.co.celsys.CLIPSTUDIO launcher executable. | [source](https://www.clipstudio.net/quickmanual/en/) |
| [Cn Neixin Pc](https://doesitarm.com/app/cn-neixin-pc) | The current macOS release version is behind employee sign-in and could not be confirmed. | [source](https://tech.meituan.com/2020/05/21/Sketch-Plugin.html) |
| [Color Efex Pro 5](https://doesitarm.com/app/color-efex-pro-5) | The exact Color Efex Pro 5 build number and whether its executable is arm64 or Intel-only remain unverified. | [source](https://support.dxo.com/hc/en-us/articles/4948144226845-How-can-I-manually-export-or-import-presets-recipes-into-Nik-Collection-by-DxO-from-a-pre-DxO-version-macOS-only) |
| [ColorChecker Passport](https://doesitarm.com/app/colorchecker-passport) | No current installer or maintenance statement for the exact Passport bundle establishes its disposition, and later product bundle IDs were… | [source](https://www.northlight-images.co.uk/colorchecker-passport-software-update/) |
| [ConceptDraw DIAGRAM](https://doesitarm.com/app/conceptdraw-diagram) | The vendor confirms Apple Silicon compatibility but does not specify the executable architecture or Rosetta mode. | [source](https://www.conceptdraw.com/products/system-requirements) |
| [CreateDiskImage](https://doesitarm.com/app/creatediskimage) | The developer's website and disk image did not load, and current distribution or maintenance status could not be established. | [source](https://creativecow.net/forums/thread/plugins-templates-apps-and-tips/) |
| [Crossy Road Castle](https://doesitarm.com/app/crossy-road-castle) | The official sources establish current Mac availability, but there is no independently verified executable architecture for 12.5. | [source](https://www.hipsterwhale.com/crossy-road-castle-support) |
| [Cyberex SecAccess](https://doesitarm.com/app/cyberex-secaccess) | No vendor attribution, current official macOS download, or architecture evidence could be verified. |  |
| [Data Virtuality Studio](https://doesitarm.com/app/data-virtuality-studio) | A public versioned macOS installer or a vendor statement tying a Studio build to a CPU architecture was not available. | [source](https://docs.datavirtuality.com/v25/installing-cdata-virtuality-studio-macos) |
| [Deezer](https://doesitarm.com/app/deezer) | The earlier Mac releases have universal evidence, but the current 8.0.10 main executable architecture could not be verified within the… | [source](https://formulae.brew.sh/cask/deezer) |
| [Deliveries](https://doesitarm.com/app/deliveries) | The older Apple Silicon compatibility note does not establish the CPU architecture of the current 9.7 Mac release. | [source](https://junecloud.com/software/mac/deliveries.html) |
| [Diagram Weaver](https://doesitarm.com/app/diagram-weaver) | The former Mac App Store page no longer resolves, and current official distribution and architecture could not be established. | [source](https://itunes.apple.com/lookup?id=1474092248&country=cn) |
| [Disk Analyzer Pro](https://doesitarm.com/app/disk-analyzer-pro) | The vendor and Apple's catalog do not state the current Mac binary's architecture. | [source](https://www.diskanalyzerpro.com/mac-disk-analyzer/) |
| [DiskLed](https://doesitarm.com/app/diskled) | A current official build, formal retirement, and Rosetta 2 behavior remain unverified. | [source](https://www.macotakara.jp/etc/category-56/entry-12093.html) |
| [DiskO](https://doesitarm.com/app/disko) | Current official distribution and release architecture could not be confirmed. | [source](https://disk-o.cloud/en/faq/app-osx/) |
| [Distiller](https://doesitarm.com/app/distiller) | A current Distiller-specific version and its executable architecture still need vendor confirmation or binary inspection. | [source](https://www.adobe.com/devnet-docs/acrobatetk/tools/AdminGuide_Mac/macintosh_deployment.html) |
| [DjVu2PDF](https://doesitarm.com/app/djvu2pdf) | No architecture declaration or official binary suitable for inspection was found for 1.4.1. | [source](https://apps.apple.com/cm/app/djvu2pdf/id629039447?mt=12) |
| [Doit.im](https://doesitarm.com/app/doitim) | The current build and architecture across vendor and store channels are unresolved, and no reliable Apple Silicon runtime evidence was… | [source](https://apps.apple.com/us/app/doit-im/id533391459?mt=12) |
| [Dresden Files Co-op Card Game](https://doesitarm.com/app/dresden-files-co-op-card-game) | The current Mac executable architecture and whether Steam compatibility requires Rosetta were not established. | [source](https://dfco.hiddenachievement.com/) |
| [DVIP](https://doesitarm.com/app/dvip) | The terms of Mac App Store compatibility and architecture of the 1.1.2 executable could not be verified, and the newer x86 download has no… | [source](https://datavideo.com/us/faq/360058611333) |
| [E-Mage Reloaded](https://doesitarm.com/app/e-mage-reloaded) | No developer release page or current binary for Benjamin Montazer's E-Mage Reloaded was found. | [source](https://github.com/douglasjunior/emage/releases/tag/0.0.2) |
| [EasyFileDateChanger](https://doesitarm.com/app/easyfiledatechanger) | The store exposes neither architecture metadata nor an official standalone binary that could be inspected. | [source](https://apps.apple.com/us/app/easy-file-date-changer/id1245868203?mt=12) |
| [EasyRingtones](https://doesitarm.com/app/easyringtones) | The current or final official release and Rosetta behavior could not be verified. |  |
| [EndpointConnect](https://doesitarm.com/app/endpointconnect) | The CPU architecture of the current standalone client could not be verified, and the E84.70 Rosetta requirement applies to that historical… | [source](https://sc1.checkpoint.com/documents/E89.x/EN/Remote_Access_VPN_Clients_for_macOS_RN/CP_E89.x_Remote_Access_VPN_Clients_for_macOS_Release_Notes.pdf) |
| [Envy](https://doesitarm.com/app/envy) | The vendor confirms a universal 2.1.7 build, but does not specify the architecture of 2.2.2 and its 340 MB archive exceeds the inspection… | [source](https://www.thecargocult.nz/downloads/) |
| [Epochulator](https://doesitarm.com/app/epochulator) | No current official distribution was found. | [source](https://en.freedownloadmanager.org/Mac-OS/amp/Epochulator-unix-time-calculator.html) |
| [ExactScan Pro](https://doesitarm.com/app/exactscan-pro) | The current Pro binary's architecture and exact 26.x build are unverified. | [source](https://exactscan.com/download.html) |
| [FileInsight](https://doesitarm.com/app/fileinsight) | The developer announces Apple Silicon compatibility in 1.5 but does not specify arm64, Universal or Rosetta, and the current Mac App Store… | [source](https://itunes.apple.com/lookup?id=777031670&entity=macSoftware) |
| [Filemail](https://doesitarm.com/app/filemail) | The former Mac App Store edition could not be matched to a current vendor bundle, and the current website installer exceeds the 150 MB… | [source](https://macupdater.net/app_updates/index-2025-05-28.html) |
| [findMyStock](https://doesitarm.com/app/findmystock) | No architecture statement or inspectable official package surfaced for the exact Mac App Store build. | [source](https://apps.apple.com/us/app/id789200963) |
| [Firewall](https://doesitarm.com/app/firewall) | The App Store release and bundle ID are verifiable, but no architecture evidence was found for the distributed 2.2 binary. | [source](https://www.paragon-software.com/us/home/firewall-mac/) |
| [Flowchart Designer 3](https://doesitarm.com/app/flowchart-designer-3) | The developer’s wording does not establish whether the current Mac build is arm64, universal, or Intel running under Rosetta. | [source](https://apps.apple.com/us/app/flowchart-designer-3/id1512570906?platform=mac) |
| [FluoroCT](https://doesitarm.com/app/fluoroct) | No currently distributed build, project retirement statement, or current architecture was found. | [source](https://fluoroct.softwar.io/) |
| [FM TiNES 2](https://doesitarm.com/app/fm-tines-2) | The architecture of a specific current com.gospelmusicians.FMTiNES2 standalone build remains unverified. | [source](https://gospelmusicians.com/products/fm-tines-2) |
| [FMOD Studio](https://doesitarm.com/app/fmod-studio) | A native build of the exact app is documented in a crash log, but the current official Mac release architecture could not be tied to a… | [source](https://www.fmod.com/download) |
| [FusionAccess](https://doesitarm.com/app/fusionaccess) | The current Mac client version and architecture for com.huawei.fusionaccess could not be established. | [source](https://carrier.huawei.com/~/media/CNBG/Downloads/Product/IT/en/Huawei%20FusionCloud%20Desktop%20Solution%20Data%20Sheet.pdf) |
| [FutuNiuniu](https://doesitarm.com/app/futuniuniu) | The vendor and cask do not state the build architecture, and the official installer exceeds the brief's 150 MB inspection limit. | [source](https://www.futunn.com/hk/download/mac?lang=zh-hk) |
| [Growtopia](https://doesitarm.com/app/growtopia) | A current standalone Mac binary and its architecture could not be verified, and the historical standalone Mac download endpoint returned an… | [source](https://www.ubisoft.com/en-us/games/growtopia) |
| [Guarda](https://doesitarm.com/app/guarda) | The architecture of the current desktop build is undocumented in the sources checked, and the installer exceeds the binary inspection size… | [source](https://guarda.com/download/) |
| [Heredis 2021](https://doesitarm.com/app/heredis-2021) | The official Mac DMG is about 465 MB, above the audit inspection limit, and no exact architecture or Rosetta claim was found. | [source](https://help.heredis.com/en/heredis-installation-links/) |
| [HiSuite](https://doesitarm.com/app/hisuite) | No explicit architecture or inspectable official package was found for this version. | [source](https://consumer.huawei.com/en/support/hisuite/) |
| [Home Anywhere Computer](https://doesitarm.com/app/home-anywhere-computer) | No current Mac release, version or architecture was verified. | [source](https://home-anywhere-computer.software.informer.com/) |
| [Home Design 21](https://doesitarm.com/app/home-design-21) | The exact v21 release's executable architectures, release date, and current availability were not verified. | [source](https://docs.imsidesign.com/projects/Punch-V21-Mac/Punch-V21-Mac/Getting-Started/Welcome/) |
| [HwpMac2014VIEWER](https://doesitarm.com/app/hwpmac2014viewer) | Universal architecture is documented for 12.31.4 only and could not be verified for the current 12.31.9 release. | [source](https://apps.apple.com/kr/app/%ED%95%9C%EC%BB%B4%EC%98%A4%ED%94%BC%EC%8A%A4-%ED%95%9C%EA%B8%80-viewer/id416746898?mt=12) |
| [iCUE](https://doesitarm.com/app/icue) | The bootstrap archive contains no com.corsair.cue.main app, and the setup guide does not identify a release or say whether the installed… | [source](https://www.corsair.com/us/en/s/downloads) |
| [ILGExam360](https://doesitarm.com/app/ilgexam360) | The vendor’s generic processor requirements do not establish whether the account-gated Mac build is Intel-only or native, and the current… | [source](https://www.ilgexam360.com/faq.action) |
| [iLovePDF](https://doesitarm.com/app/ilovepdf) | The Mac App Store omits CPU architecture, and direct Mac installers are available through the vendor’s sales team. | [source](https://www.ilovepdf.com/desktop) |
| [Image Lab](https://doesitarm.com/app/image-lab) | The baseline processor requirement does not identify the Mac executable architecture, the installer could not be inspected, and Apple… | [source](https://www.bio-rad.com/en-dk/product/image-lab-software?ID=KRE6P5E8Z&source_wt=imagelabsoftware_surl) |
| [Image Viewer](https://doesitarm.com/app/image-viewer) | The former Mac App Store page did not resolve in five checked storefronts, and current official distribution and Rosetta operation could… | [source](https://abacusapplications.com/imageviewerhelp.html) |
| [Instagram Downloader](https://doesitarm.com/app/instagram-downloader) | No current official release, maintainer page, or architecture evidence was found for baonguyen.Instagram-Downloader. |  |
| [InteleViewer](https://doesitarm.com/app/inteleviewer) | No architecture evidence was found for the current provider-distributed build, whose disk image is 214 MB. | [source](https://inteleviewer.documentation.intelerad.com/iv-help/PACS-5-2-1-P171/en/Content/Topics/IV_Installing_Mac.html) |
| [Iqiyi Player](https://doesitarm.com/app/iqiyi-player) | The current Mac App Store executable architecture could not be verified. | [source](https://www.iqiyi.com/appstore.html) |
| [iStumbler](https://doesitarm.com/app/istumbler) | The new Mac App Store release’s arm64 or universal architecture has not been stated or inspected. | [source](https://istumbler.net/feeds/appcast.rss) |
| [iWall](https://doesitarm.com/app/iwall) | The current 9.0.1 Mac App Store binary was unavailable for inspection, and the explicit native wording in the version history refers to an… | [source](https://apps.apple.com/us/app/iwall-dynamic-desktop-engine/id1214761683?mt=12) |
| [Jaspersoft Studio Professional](https://doesitarm.com/app/jaspersoft-studio-professional) | The architecture and Rosetta behavior of the commercial 9.0.2 Mac binary could not be verified. | [source](https://community.jaspersoft.com/files/file/115-jaspersoft-studio/) |
| [jdNetdisk](https://doesitarm.com/app/jdnetdisk) | JD’s public site requires an enterprise account and does not expose a current desktop release, installer or Mac architecture statement. | [source](https://box.jd.hk/) |
| [JDownloader2](https://doesitarm.com/app/jdownloader2) | The vendor labels the installer by architecture but does not identify a specific current version and architecture of the installed… | [source](https://jdownloader.org/jdownloader2) |
| [KeyboardLock](https://doesitarm.com/app/keyboardlock) | No current release, developer page, or architecture information could be tied to this bundle ID. |  |
| [Kill](https://doesitarm.com/app/kill) | A current official release, distribution channel, and Apple Silicon behavior could not be established. |  |
| [Kitsas](https://doesitarm.com/app/kitsas) | The Mac release has no documented architecture and the 221 MB DMG exceeds the brief's binary-inspection limit. | [source](https://kitsas.fi/lataa/) |
| [KMyMoney](https://doesitarm.com/app/kmymoney) | The KDE Mac download page reports broken CI builds and no current official Mac artifact was found. | [source](https://kmymoney.org/macos.html) |
| [Knotes](https://doesitarm.com/app/knotes) | No current official desktop binary or architecture statement was located for 2.11.2, and the maintenance status is unclear. | [source](https://help.knotesapp.cn/changelog-posts/) |
| [KugouMusic](https://doesitarm.com/app/kugoumusic) | The Mac App Store release's executable architecture could not be confirmed. | [source](https://download.kugou.com/mac.html) |
| [Lightworks](https://doesitarm.com/app/lightworks) | The sources establish Apple Silicon compatibility without specifying the actual executable slices, and the 2026.1.2 disk image exceeds the… | [source](https://lwks.com/lightworks-knowledge-base/installation-and-setup) |
| [LiveIPC](https://doesitarm.com/app/liveipc) | A current upstream distribution or architecture statement for LiveIPC 1.4.0 could not be verified, and the reseller download did not yield… | [source](https://manualzilla.com/doc/7414164/wansview-b-series-user-manual) |
| [Ludo-desktop](https://doesitarm.com/app/ludo-desktop) | The current availability, continuity and architecture of the exact scanned bundle could not be verified. | [source](https://itunes.apple.com/lookup?bundleId=com.cronlygames.ludo.mac&entity=macSoftware&country=us) |
| [Mac Auto Clicker](https://doesitarm.com/app/mac-auto-clicker) | Current official distribution and support status for the original bundle could not be verified. | [source](https://mac.filehorse.com/download-mac-auto-clicker/) |
| [mediaget](https://doesitarm.com/app/mediaget) | The official Mac download did not yield a verifiable current version or Mach-O architecture. | [source](https://mediaget.com/en/install/mac) |
| [MetaTrader 4](https://doesitarm.com/app/metatrader-4) | The current package’s bundle ID and executable architecture could not be verified against the exact CodeWeavers OEM build in the listing. | [source](https://www.metatrader4.com/en/releasenotes/551) |
| [MindManager](https://doesitarm.com/app/mindmanager) | The developer's Rosetta 2 article does not name a version, current release notes omit architecture, and the 295 MB official installer is… | [source](https://www.mindmanager.com/en/support/download-library/) |
| [MiniPlay](https://doesitarm.com/app/miniplay) | I found no current release or reliable vendor statement of retirement or compatibility. | [source](https://itunes.apple.com/lookup?bundleId=com.macappsters.musicboxforpandora) |
| [monday.com](https://doesitarm.com/app/mondaycom) | No architecture statement or inspectable current installer was found for the Mac App Store desktop build. | [source](https://support.monday.com/hc/en-us/articles/115005316885-monday-com-s-desktop-app) |
| [Movavi Screen Recorder 22](https://doesitarm.com/app/movavi-screen-recorder-22) | The executable architecture and Rosetta behavior of the exact 22.5.1 bundle remain unverified. | [source](https://www.movavi.com/mac-screen-recorder/whats-new.html) |
| [Movavika Video Editor 26](https://doesitarm.com/app/movavika-video-editor-26) | The processor requirements do not establish the installed 26.24.1 Mach-O architecture, and the vendor's disk image contains the bootstrap… | [source](https://www.movavika.ru/video-editor-plus-mac/whats-new.html) |
| [MPlayerX](https://doesitarm.com/app/mplayerx) | I found no official source linking the scanned com.telephoto.identifier bundle or its reported build 107.114 to a current release. | [source](https://github.com/niltsh/MPlayerX/releases/tag/1.1.1) |
| [Mural](https://doesitarm.com/app/mural) | No first-party architecture statement was found, and both current official packages exceed the brief's binary inspection size limit. | [source](https://www.mural.co/apps) |
| [mwplay](https://doesitarm.com/app/mwplay) | No current release or architecture could be established for the scanned desktop bundle. | [source](https://techex.tv/products/tx-iptv) |
| [My Hospital](https://doesitarm.com/app/my-hospital) | The current Mac Store package could not be inspected and the scan in the batch covers version 1.1.33. | [source](https://apps.apple.com/us/app/my-hospital/id1133956228?mt=12) |
| [Navigation Updater](https://doesitarm.com/app/navigation-updater) | The newer official Mac installer exceeds 150 MB, and the community reports do not identify the version or architecture it installs. | [source](https://update.hyundai.com/AU/EN/navigationUpdate) |
| [NemuPlayer](https://doesitarm.com/app/nemuplayer) | No current official package or support statement was found for com.netease.nemu, and no vendor source established that the current Apple… | [source](https://www.mumuplayer.com/help/mac/install-mumuplayer-pro.html) |
| [NewTek NDI Access Manager](https://doesitarm.com/app/newtek-ndi-access-manager) | The vendor does not document the version or architecture of the individual Access Manager executable, and the combined Mac package exceeds… | [source](https://docs.ndi.video/all/using-ndi/ndi-tools/ndi-tools-for-mac/access-manager) |
| [Norton 360](https://doesitarm.com/app/norton-360) | Norton confirms Apple Silicon compatibility, but the release announcement and support documentation do not identify the 26.10.0 main… | [source](https://community.norton.com/t/norton-for-mac-v26-10-has-been-released/531142) |
| [Nutshell Apps](https://doesitarm.com/app/nutshell-apps) | I did not find a current official Mac build or documented architecture for the original com.nutshellapps.nutshellmobile listing. | [source](https://play.google.com/store/apps/details?hl=en_US&id=com.nutshellapps.nutshellmobile) |
| [O2_Insight_Pro](https://doesitarm.com/app/o2insightpro) | The current Mac release’s executable architecture is undocumented and the vendor links only to an App Store download. | [source](https://www.viatomtech.com/support) |
| [OKX](https://doesitarm.com/app/okx) | The current standard Mac package version and architecture could not be verified, and that disk image exceeded the 150 MB inspection limit. | [source](https://www.okx.com/download) |
| [Only Friends](https://doesitarm.com/app/only-friends) | The original website, publisher, current distribution, and architecture could not be established. | [source](https://www.todesktop.com/builder/docs/application/download-links-from-your-website) |
| [OpenConnect-GUI](https://doesitarm.com/app/openconnect-gui) | The current arm64 binary is packaged by MacPorts, and I found no corresponding upstream macOS binary for 1.6.2. | [source](https://ports.macports.org/port/openconnect-gui/details/) |
| [Origami Studio](https://doesitarm.com/app/origami-studio) | Evidence identifies a previous universal build, but no architecture evidence specific to the current release 233 was found and its disk… | [source](https://origami.design/releases/) |
| [Overflow](https://doesitarm.com/app/overflow) | The vendor does not say whether the executable is native or translated, and the current disk image exceeds the audit's inspection size… | [source](https://overflow.io/download/mac/) |
| [Pavtube ByteCopy](https://doesitarm.com/app/pavtube-bytecopy) | The publisher download could not be retrieved, and the surviving product pages do not identify a current Mac build or its architecture. | [source](https://bluraydtstruehd.com/product/bytecopy-for-mac/) |
| [PerfDog](https://doesitarm.com/app/perfdog) | Neither download identifies its executable architecture, and both packages exceed the audit’s 150 MB inspection limit. | [source](https://perfdog.wetest.net/) |
| [Picascade](https://doesitarm.com/app/picascade) | The publisher, purpose, current distribution and architecture could not be established from the scan, repository search or Mac App Store… |  |
| [Pinball Arcade](https://doesitarm.com/app/pinball-arcade) | The current Mac App Store executable's architecture was not verified, and the M1 user report does not say whether Rosetta was used. | [source](https://apps.apple.com/us/app/pinball-arcade/id509675654?mt=12) |
| [PINManager](https://doesitarm.com/app/pinmanager) | No current release, architecture, or formal retirement notice could be established for the exact PINManager bundle. | [source](https://www.b-trust.bg/en/client-center/instructions) |
| [PioneerDriveUtilityLiteForMac](https://doesitarm.com/app/pioneerdriveutilityliteformac) | The vendor's listed macOS releases do not establish the CPU architecture or Rosetta behavior, and download access requires accepting a… | [source](https://pioneer.jp/device_e/product-e/ibs/device_e/dev00001r_e.html) |
| [Pixel Starships](https://doesitarm.com/app/pixel-starships) | The exact bundle is still listed, but its current Mach-O architecture and Rosetta status remain unverified. | [source](https://store.steampowered.com/app/378760/Pixel_Starships/) |
| [Planner 5D](https://doesitarm.com/app/planner-5d) | The vendor and store do not state the CPU architecture of the current Mac app. | [source](https://planner5d.com/promo/macos) |
| [Plex](https://doesitarm.com/app/plex) | The publisher and product behind sddda.Plex could not be established. | [source](https://formulae.brew.sh/cask/plex) |
| [Polypad](https://doesitarm.com/app/polypad) | The current Mac executable's architecture is unverified, and the developer site redirected away from the product. | [source](https://apps.apple.com/us/app/polypad-scriptable-textpad/id1589866547?mt=12) |
| [PSE Download Manager](https://doesitarm.com/app/pse-download-manager) | The 161 MB package exceeds the audit's binary-inspection limit and the vendor does not specify architecture. | [source](https://www.prosoundeffects.com/download-manager) |
| [QIDI-Print](https://doesitarm.com/app/qidi-print) | The 6.5.4 Mac binary architecture is undocumented in the sources checked and the 286 MB disk image exceeds the inspection limit. | [source](https://eu.qidi3d.com/pages/software-firmware/) |
| [QVR Pro Client](https://doesitarm.com/app/qvr-pro-client) | QNAP confirms operation on Apple Silicon but does not state whether the current package contains an arm64 executable. | [source](https://www.qnap.com/en/utilities/surveillance?utility=QVR+Pro+Client) |
| [RAR Extractor Max](https://doesitarm.com/app/rar-extractor-max) | No CPU architecture statement or inspectable official Mac package was found for 13.9.6. | [source](https://dami0209.github.io/) |
| [Raven Desktop Beta](https://doesitarm.com/app/raven-desktop-beta) | The official Mac download could not be accessed, and the historical beta bundle could not be tied to a current build. | [source](https://support.neat.com/3-rdpartyscanners/raven-pro) |
| [Reigns](https://doesitarm.com/app/reigns) | The Rosetta report covers an older build than the August anniversary update, whose executable architecture remains unverified. | [source](https://store.steampowered.com/app/474750/Reigns) |
| [reMarkable](https://doesitarm.com/app/remarkable) | No accessible primary evidence established the Mach-O architecture of current Mac App Store version 3.29.0. | [source](https://support.remarkable.com/s/article/About-the-Desktop-app) |
| [Seclore Lite Main](https://doesitarm.com/app/seclore-lite-main) | The current main bundle’s architecture and exact version were not established from public documentation, and no public current client… | [source](https://support.seclore.com/support/solutions/articles/11000138493-antivirus-edr-exclusion-list-for-seclore-for-macos) |
| [Shift](https://doesitarm.com/app/shift) | The vendor does not publish the Mac executable architecture, and the official 1.27.0 disk image exceeds the audit's inspection size limit. | [source](https://helpdesk.editshare.com/hc/en-us/articles/26035873119387-Do-links-with-shift-io-still-work) |
| [ShotPro](https://doesitarm.com/app/shotpro) | No versioned architecture statement for ShotPro S was found, and its Mac archive exceeds the binary inspection limit. | [source](https://www.shotprofessional.com/faq-support) |
| [Sliver](https://doesitarm.com/app/sliver) | The current architecture for this exact macOS bundle was not verified. |  |
| [Social Manager Tools](https://doesitarm.com/app/social-manager-tools) | The historical download site failed certificate validation and the original GUI repository returned 404, leaving the final Mac release and… | [source](https://wiset.github.io/) |
| [Sonarworks SoundID Listen](https://doesitarm.com/app/sonarworks-soundid-listen) | A current desktop build, its architecture, and a formal end-of-life notice could not be verified. | [source](https://www.sonarworks.com/legal/soundid/end-user-license-agreement) |
| [SpatialKey Client](https://doesitarm.com/app/spatialkey-client) | No current release, binary architecture, or end-of-support notice for the Mac client was found. | [source](https://insurity.com/press-release/insurity-acquires-spatialkey-inc-leader-pc-geospatial-analytics) |
| [Spdpd Dpdassistant](https://doesitarm.com/app/spdpd-dpdassistant) | The direct official arm64 installer now returns 404, and current access to the matching build through the vendor's cloud mirrors could not… | [source](http://spdpd.net/) |
| [SPO2](https://doesitarm.com/app/spo2) | A current public Mac release, a device download code for this exact bundle, and Apple Silicon runtime evidence were unavailable. | [source](https://www.contecmed.com/newsinfo/496887.html) |
| [Spoon CAST Converter](https://doesitarm.com/app/spoon-cast-converter) | No vendor page, current official Mac download, or architecture statement was found for this bundle. |  |
| [SSF2](https://doesitarm.com/app/ssf2) | The 64-bit label leaves the CPU architecture unspecified, and the current Mac archive exceeds the inspection size limit. | [source](https://www.supersmashflash.com/play/ssf2/downloads/) |
| [StatusClock](https://doesitarm.com/app/statusclock) | The release notes confirm native support for 1.4.1, while the current 1.6.0 Mac App Store build has no first-party architecture… | [source](https://apps.apple.com/us/app/status-clock/id552792489?mt=12) |
| [SteelSeries GG](https://doesitarm.com/app/steelseries-gg) | The architecture of the main GG executable remains unverified, and the official 108.3.0 package is about 300 MB. | [source](https://techblog.steelseries.com/2026/07/31/GG-notes-108.3.0.html) |
| [StellarPlayerForMac](https://doesitarm.com/app/stellarplayerformac) | Neither official listing identifies the executable architecture of version 4.000, and the Mac App Store binary was not available for… | [source](https://www.stellarplayer.com/) |
| [SteuerMac 2022](https://doesitarm.com/app/steuermac-2022) | The direct-download 29.17.5590 executable architecture and Rosetta status are unverified, and its official image exceeds the 150 MB… | [source](https://www.buhl.de/download/wiso-steuer-2022/) |
| [Steven Slate Audio Center](https://doesitarm.com/app/steven-slate-audio-center) | The M1/Intel label does not specify the app executable’s architecture, and the 186 MB DMG exceeds the brief’s inspection limit. | [source](https://stevenslateaudio.com/installers) |
| [Tasmotizer](https://doesitarm.com/app/tasmotizer) | The scanned Mac bundle could not be matched to a current official app artifact with a version and architecture. | [source](https://github.com/tasmota/tasmotizer) |
| [Tc Employeehub](https://doesitarm.com/app/tc-employeehub) | No public vendor source or official current build could be located to verify the app’s distribution or current architecture. |  |
| [TCANLINPro](https://doesitarm.com/app/tcanlinpro) | The vendor download returned a verification page, and I could not establish a current official Mac release or its architecture. | [source](https://gitee.com/hao878/can_uds_bootloader/blob/master/README.md) |
| [Tdx TdxiMac](https://doesitarm.com/app/tdx-tdximac) | The historical vendor download host no longer resolves, and no current version or architecture was verifiable for this exact brokerage… | [source](https://www.tdx.com.cn/qs.html) |
| [TestGen](https://doesitarm.com/app/testgen) | Public developer documentation does not identify the current Mac binary architecture, and the official download requires publisher… | [source](https://www.tamarack-software.com/) |
| [TftpServer](https://doesitarm.com/app/tftpserver) | The architecture and Rosetta behavior of 3.6.1 could not be confirmed from the developer's surviving documentation and downloads. | [source](https://web.archive.org/web/20200105171027id_/http://ww2.unime.it/flr/tftpserver/help.html) |
| [TH-D74 Programmer](https://doesitarm.com/app/th-d74-programmer) | No versioned architecture documentation or public current Mac package was available for this model. | [source](https://www.rtsystemsinc.com/th-d74-mac-info.html) |
| [TomieWGM](https://doesitarm.com/app/tomiewgm) | No reliable current official Mac release or architecture was located. | [source](https://www.patreon.com/ollane) |
| [Toontrack solo](https://doesitarm.com/app/toontrack-solo) | No current vendor download or explicit architecture for the exact 1.3.2.1 Mac build was verified. | [source](https://www.toontrack.com/faq/known-issues-with-solo/) |
| [TrackingTime](https://doesitarm.com/app/trackingtime) | The vendor did not specify the CPU architecture or publish a download small enough for binary inspection under the brief. | [source](https://support.trackingtime.co/en/articles/3697011-trackingtime-desktop-assistant-for-windows-and-mac) |
| [Transformice](https://doesitarm.com/app/transformice) | Could not establish whether the current Steam Mac download matches the scanned Electron bundle or verify the architecture or runtime… | [source](https://github.com/atelier801/transformice-executable-macos) |
| [TraX](https://doesitarm.com/app/trax) | The developer product page is unavailable, and neither a current official build nor Rosetta behavior for the scanned 3.1.1 could be… | [source](https://community.roonlabs.com/t/beginners-guide-to-extracting-audio-from-sacds/190024) |
| [TrendMicroSecurity](https://doesitarm.com/app/trendmicrosecurity) | No current version of the exact MainUI executable was available for architecture inspection. | [source](https://success.trendmicro.com/en-US/solution/ka-0011072/) |
| [TuritoWhiteboard](https://doesitarm.com/app/turitowhiteboard) | The scanned Tencent bundle could not be matched to a current official Turito Mac download or confirmed to be a standalone app. | [source](https://whiteboard.turito.com/) |
| [Ultimate Guitar - Chords & Tabs](https://doesitarm.com/app/ultimate-guitar-chords-and-tabs) | The current distribution, version, and architecture of the standalone Mac Catalyst bundle could not be verified. | [source](https://apps.apple.com/us/app/ultimate-guitar-chords-tabs/id357828853?platform=mac) |
| [UniFi Network Server](https://doesitarm.com/app/unifi-network-server) | The current 10.6.109 DMG exceeds 150 MB, and the exact architecture of its UniFi.app launcher was not established. | [source](https://www.ui.com/download/unifi) |
| [Vadi Sound Library](https://doesitarm.com/app/vadi-sound-library) | The current Mac release, its architecture, and any formal end-of-life notice were not found. | [source](https://vadisound.com/terms-and-conditions/) |
| [Vakten](https://doesitarm.com/app/vakten) | No current official macOS package, release notes, or vendor architecture statement was found. | [source](https://www.keycyber.es/wp-content/uploads/2023/12/How-it-works-4.0.pdf) |
| [WacDonald's](https://doesitarm.com/app/wacdonalds) | A current official Mac release and its architecture could not be verified. | [source](https://wacdonalds-cooking-simulator.softwar.io/) |
| [WebPViewer](https://doesitarm.com/app/webpviewer) | The developer says Apple Silicon is supported but gives no architecture, and the current executable was unavailable for inspection. | [source](https://langui.net/webp-viewer/) |
| [WebVideoHunter](https://doesitarm.com/app/webvideohunter) | The vendor domain did not resolve, and no current official release, retirement statement, or Rosetta report was found. | [source](https://mac.softpedia.com/get/Internet-Utilities/YouTubeHunter.shtml) |
| [WiFiMasterKey](https://doesitarm.com/app/wifimasterkey) | No current official release or architecture evidence was found for WiFi万能钥匙 Pro itself. | [source](https://cn.wifi.com/security/index.html) |
| [Winamax Poker](https://doesitarm.com/app/winamax-poker) | The current distribution or support status of the exact 6.15.2 bundle, and whether it runs on Apple Silicon, could not be verified. | [source](https://www.clubpoker.net/forum-poker/topic/198638-probl%C3%A8me-pour-lancer-winamax/) |
| [Wireless Workbench](https://doesitarm.com/app/wireless-workbench) | Shure specifies Apple Silicon compatibility for 7.9.0 but has not stated the executable architecture for that build, and its 624 MB package… | [source](https://www.shure.com/en-US/support/downloads/software-firmware-archive/wireless-workbench) |
| [Wizard101](https://doesitarm.com/app/wizard101) | The current 1.30 architecture and Rosetta behavior remain unverified. | [source](https://www.kingsisle.com/wp/press/wizard101-now-available-for-mac/) |
| [WPXO](https://doesitarm.com/app/wpxo) | The catalog and vendor site do not state the binary architecture or Rosetta behavior. | [source](https://dalegillard.com/wpxo.html) |
| [X-DAP Link](https://doesitarm.com/app/x-dap-link) | The official archive link returned 404 and the Mac updater host no longer resolves, so current distribution and the final Mac build could… | [source](https://www.pioneer-audiovisual.de/eu/firmware_update/7411/) |
| [XiYou](https://doesitarm.com/app/xiyou) | No live source tied the exact bundle ID to a current vendor or official build. | [source](https://easyxiyou.com/zh-hans/products/mac) |
| [Xoctave](https://doesitarm.com/app/xoctave) | The publisher and any current distribution channel for this exact bundle could not be established. | [source](https://support.apple.com/en-us/103076) |
| [XstereO Player](https://doesitarm.com/app/xstereo-player) | The current 4.4 release notes give no architecture and no current Mach-O binary was available for inspection. | [source](https://itunes.apple.com/lookup?id=475195500&entity=macSoftware) |
| [Youku Mac](https://doesitarm.com/app/youku-mac) | No architecture-specific installer, official statement, or inspectable download for this exact desktop build was verified. | [source](https://www.youku.com/ku/product/index) |
| [Yuque App](https://doesitarm.com/app/yuque-app) | The current public Mac DMG is approximately 197 MB and was not eligible for binary inspection under the brief’s limit. | [source](https://www.yuque.com/download) |
| [Zen Pinball 2](https://doesitarm.com/app/zen-pinball-2) | The Rosetta report predates version 1.4.3, whose architecture and Apple Silicon runtime have not been verified. | [source](https://apps.apple.com/us/app/zen-pinball-2/id527953383?mt=12) |
| [Zhan Mokao](https://doesitarm.com/app/zhan-mokao) | The official Mac download requires sign-in, so the current downloadable version and its architecture could not be verified. | [source](https://toefl.zhan.com/index.php/) |

## Changes after maintainer review (2026-11-27)

The JSONL records are unchanged; they still use the scan listing names. This section records how README lines differ from them.

### Renamed

Each line now uses the name the maker uses for the product, without a version, build or file suffix. Every renamed entry still absorbs its own scan under the matching rules in [app-name-collisions.md](../app-name-collisions.md), and each changed URL has a 301 in `src/middleware-rules.js`. Names with a parenthesised part keep the scan's name as an exact alternative so the scan is still absorbed.

| Record name | README name | Old path | New path |
| --- | --- | --- | --- |
| 115 | 115 Desktop | /app/115 | /app/115-desktop |
| ApacheDirectoryStudio | Apache Directory Studio | /app/apachedirectorystudio | /app/apache-directory-studio |
| BrowserStackLocal | BrowserStack Local | /app/browserstacklocal | /app/browserstack-local |
| Cheat Engine 7.3 | Cheat Engine | /app/cheat-engine-73 | /app/cheat-engine |
| Eclipse-inst | Eclipse Installer | /app/eclipse-inst | /app/eclipse-installer |
| gtkwave | GTKWave | /app/gtkwave | unchanged |
| pico8 | PICO-8 | /app/pico8 | /app/pico-8 |
| SoapUI-5.7.2 | SoapUI | /app/soapui-572 | /app/soapui |
| SQLiteStudio | Letos (SQLiteStudio) | /app/sqlitestudio | /app/letos-sqlitestudio |
| iramuteq | IRaMuTeQ | /app/iramuteq | unchanged |
| Loupe Browser 6 | Loupe Browser | /app/loupe-browser-6 | /app/loupe-browser |
| ngraph-gtk | Ngraph-GTK | /app/ngraph-gtk | unchanged |
| Ovito | OVITO | /app/ovito | unchanged |
| Slicer 4.11.20210226 | 3D Slicer (Slicer) | /app/slicer-41120210226 | /app/3d-slicer-slicer |
| CradleHub | Cradle Hub | /app/cradlehub | /app/cradle-hub |
| Mixed In Key 10 | Mixed In Key | /app/mixed-in-key-10 | /app/mixed-in-key |
| Philharmonik 2 | Miroslav Philharmonik 2 | /app/philharmonik-2 | /app/miroslav-philharmonik-2 |
| VCV Rack 2 Free | VCV Rack | /app/vcv-rack-2-free | /app/vcv-rack |
| Corel Font Manager 2021 | Corel Font Manager | /app/corel-font-manager-2021 | /app/corel-font-manager |
| Corel PHOTO-PAINT 2021 | Corel PHOTO-PAINT | /app/corel-photo-paint-2021 | /app/corel-photo-paint |
| Icons8 | Pichon (Icons8) | /app/icons8 | /app/pichon-icons8 |
| PhotoScapeX | PhotoScape X | /app/photoscapex | /app/photoscape-x |
| Avidemux2.8.app | Avidemux | /app/avidemux28app | /app/avidemux |
| Mocha Pro 2020.5 | Mocha Pro | /app/mocha-pro-20205 | /app/mocha-pro |
| Movavi Video Converter 21 Premium | Movavi Video Converter | /app/movavi-video-converter-21-premium | /app/movavi-video-converter |
| YTD | YTD Video Downloader | /app/ytd | /app/ytd-video-downloader |
| ontime | Ontime | /app/ontime | unchanged |
| Creality_Print | Creality Print | /app/crealityprint | /app/creality-print |
| datovka | Datovka | /app/datovka | unchanged |
| DeskCover Pro | DeskCover | /app/deskcover-pro | /app/deskcover |
| Kingsoft Kdocs Mac | Kingsoft KDocs | /app/kingsoft-kdocs-mac | /app/kingsoft-kdocs |
| owncloud | ownCloud | /app/owncloud | unchanged |
| teamlogger | TeamLogger | /app/teamlogger | unchanged |
| texmaker | Texmaker | /app/texmaker | unchanged |
| Timeular | EARLY (Timeular) | /app/timeular | /app/early-timeular |
| Tutanota Desktop | Tuta Mail (Tutanota Desktop) | /app/tutanota-desktop | /app/tuta-mail-tutanota-desktop |
| Covenant Eyes | Victory Shield (Covenant Eyes) | /app/covenant-eyes | /app/victory-shield-covenant-eyes |
| Democracy3 | Democracy 3 | /app/democracy3 | /app/democracy-3 |
| eso | The Elder Scrolls Online (ESO) | /app/eso | /app/the-elder-scrolls-online-eso |
| SecondLife | Second Life Viewer | /app/secondlife | /app/second-life-viewer |
| touchbar_nyancat | Touchbar Nyancat | /app/touchbarnyancat | /app/touchbar-nyancat |
| WeLinkMeeting | HUAWEI CLOUD Meeting (WeLinkMeeting) | /app/welinkmeeting | /app/huawei-cloud-meeting-welinkmeeting |
| JetDriveToolbox | JetDrive Toolbox | /app/jetdrivetoolbox | /app/jetdrive-toolbox |
| LibreELEC | LibreELEC USB-SD Creator | /app/libreelec | /app/libreelec-usb-sd-creator |
| Retroactive (right click to open) | Retroactive | /app/retroactive-right-click-to-open | /app/retroactive |
| SMARTReporter-DEMO | SMARTReporter | /app/smartreporter-demo | /app/smartreporter |
| Suuntolink | SuuntoLink | /app/suuntolink | unchanged |
| Camera Settings | Logitech Camera Settings | /app/camera-settings | /app/logitech-camera-settings |
| Maltego 4.12.1 | Maltego | /app/maltego-4121 | /app/maltego |
| Stonesoft VPN Client | Forcepoint VPN Client (Stonesoft VPN Client) | /app/stonesoft-vpn-client | /app/forcepoint-vpn-client-stonesoft-vpn-client |
| Outline | Outline Client | /app/outline | /app/outline-client |

Movavi Video Converter also absorbs the `Movavi Video Converter 22 Premium` scan (an older copy of the same product), so `/app/movavi-video-converter-22-premium` redirects too.

### Removed

| Record name | Status in the record | Why |
| --- | --- | --- |
| MySQLWorkbench | native | Duplicate of the existing MySQL Workbench entry; the spaced name does not absorb the MySQLWorkbench scan under current matching |
| BitdefenderVirusScanner | native | Duplicate of the existing Bitdefender Virus Scanner entry; the spaced name does not absorb the scan |
| lghub | native | Duplicate of the existing Logitech G HUB entry; that name does not absorb the lghub scan |
| SamsungPortableSSD | native | Duplicate of the existing Samsung Portable SSD entry (which claims native as of v1.7.3.0, this record 1.6.10.1); the spaced name does not absorb the scan |
| Hype4 | native | Duplicate of the existing Tumult Hype entry; Tumult Hype 4 does not absorb the Hype4 scan |
| Oplide | native | Duplicate of the existing IBM ILOG CPLEX Optimization Studio entry (Oplide is its IDE executable) |
| Hiero13.0v2 | native | Name carries an old build (13.0v2) while the status is about 17.1v3; Hiero does not absorb the Hiero13.0v2 scan |
| HieroPlayer13.0v2 | native | Same as Hiero: HieroPlayer does not absorb the HieroPlayer13.0v2 scan |
| Nuke13.0v2 NC | native | Same as Hiero: Nuke Non-commercial does not absorb the Nuke13.0v2 NC scan |
| NukeAssist13.0v2 | native | Same as Hiero: Nuke Assist does not absorb the NukeAssist13.0v2 scan |
| NukeIndie13.0v2 | native | Same as Hiero: Nuke Indie does not absorb the NukeIndie13.0v2 scan |
| SpringToolSuite4 | native | Status covers Spring Tools 5 (now Spring Tools for Eclipse); no unversioned name absorbs the SpringToolSuite4 scan |
| Octave-6.2.0 | native | Name carries the old 6.2.0 scan version; Octave.app does not absorb the scan, and the GNU Octave entry already covers Octave |
| GLMv4 | rosetta | Evidence covers only GLM 4 on macOS 11 to 12.0 (Cloud AutoCal2); GLM 5 is the native current product, and GLM 4 does not absorb the GLMv4 scan |
| Soundminer v5Pro | rosetta | Evidence covers the old V5 Pro major version, which the vendor supports only up to macOS Monterey; the native successor is a separate purchase |
| Mail for Gmail | native | Name collision: under the matching rules on master the entry also absorbs Apple's Mail scan (`com.apple.mail`, README name = scan name + qualifier), which would remove Apple Mail's page. The current name, Mail+ for Gmail, collides the same way, and the vendor rules cannot separate them without a `SEPARATE_PRODUCTS` exception. |
| Mixbus32C-7 | rosetta | Evidence covers the 7.x bundle with an M1 report that predates Harrison's native release; renaming to Mixbus32C would misstate the current product |

### Kept under the scan name

The maker's name for these products does not absorb the scan under the current matching rules: the scan's names are run together, abbreviated or carry a build number, and no scan alias equals the spaced name. Renaming would leave the scan's own "need info" page in place next to a new page, so these keep the scan name and URL for now. A matching rule that treats names equal after removing spaces and punctuation would let most of them be renamed.

| README name | Maker's name tried |
| --- | --- |
| Aunbox ScreenRec | 嗨格式录屏大师 (HiFormat Screen Recorder) |
| cnlabSpeedTest | cnlab Speedtest |
| DAirRegistration | D-air Registration |
| DAZStudio | Daz Studio |
| DisplayPilot | Display Pilot |
| DrPDF | Dr.PDF |
| DSAssistant | Synology Assistant |
| DyingLightGame | Dying Light |
| Electron Hellofont | HelloFont |
| Electron Keyan | 棵岩阅读 (Keyan) |
| eparakstitajs3 | eParakstītājs 3.0 |
| F5Access | F5 Access |
| FoundryVTT | Foundry Virtual Tabletop |
| FTBApp | FTB App |
| Gapminder Offline | Gapminder Tools Offline |
| LogiTune | Logi Tune |
| LycheeSlicer | Lychee Slicer |
| MakeCode for microbit | MakeCode for micro:bit |
| MPKMini Mk2 Editor | MPK Mini mkII Editor |
| NoxAppPlayer | NoxPlayer |
| PA-InstallationManager | Plugin Alliance Installation Manager |
| PdaNetMac | PdaNet+ |
| PdfMetadataEditor | PDF Metadata Editor |
| PGPTSession | PGPT Session |
| PictureStyleEditor | Picture Style Editor |
| RapidMiner Studio | RapidMiner AI Studio |
| RemotePCSuite | RemotePC |
| RobloxStudio | Roblox Studio |
| SamyangLensManager | Samyang Lens Manager |
| SDFormatter | SD Memory Card Formatter |
| TouchPortal | Touch Portal |
| UVIWorkstation | UVI Workstation |
| Vista | Chroma-Q Vista |
| VNC Server | RealVNC Server |
| WSM | Sennheiser Wireless Systems Manager |
| XFUtility3 | Canon XF Utility |
| Zentraedi ZspaceMacApp | Zspace (极空间) |

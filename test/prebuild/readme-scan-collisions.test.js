import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildReadmeAppList, buildScanListMap } from '../../helpers/build-app-list.js'
import { eitherMatches, matchesWholeWord } from '../../helpers/matching.js'
import { findReadmeMatchAlias, getBundleVendor, getSlugClaimStrength, laterScanTakesSlug, SEPARATE_PRODUCTS } from '../../helpers/readme-scan-match.js'
import { makeSlug } from '../../helpers/slug.js'
import ownersFixture from './fixtures/readme-scan-owners.json'

// Scan fixtures copy aliases and bundle IDs from the live scans feed (2026-11-25)
const makeScan = (aliases, id) => ({ aliases, bundleIds: [id], tags: [], relatedLinks: [] })

function build (entries, scanList) {
    const readmeContent = '#### Apps\n\n' +
        entries.map(([name, url]) => `* [${name}](${url}) - ✅ Yes, Native Apple Silicon support`).join('\n\n') +
        '\n\n<!-- end-of-list -->'
    const scanListMap = new Map(scanList)
    const listings = buildReadmeAppList({ readmeContent, scanListMap, commits: [] })

    return { listings, scanListMap }
}

const matches = (name, url, scan) => findReadmeMatchAlias({ name, url }, scan) !== null

describe('Whole-word matching', () => {
    it('does not match a dot-led name inside a domain-style name', () => {
        expect(eitherMatches('Battle.net', '.NET')).toBe(false)
        expect(eitherMatches('Wargaming.net Game Center', '.NET')).toBe(false)
        expect(eitherMatches('.NET Core', '.NET')).toBe(true)
    })

    it('never matches a blank alias', () => {
        expect(eitherMatches('', '.NET')).toBe(false)
        expect(eitherMatches('   ', 'Steam')).toBe(false)
        expect(matchesWholeWord('', 'Steam')).toBe(false)
    })

    it('counts non-ASCII letters as letters', () => {
        expect(matchesWholeWord('pok', 'pokémon')).toBe(false)
        expect(eitherMatches('QQ音乐', 'QQ')).toBe(false)
        expect(eitherMatches('QQ 音乐', 'QQ')).toBe(true)
    })

    it('keeps punctuation as a word break for ordinary names', () => {
        expect(eitherMatches('Yandex.Disk.2', 'Yandex')).toBe(true)
        expect(eitherMatches('n-Track', 'n-Track Studio')).toBe(true)
    })
})

describe('Bundle vendor', () => {
    it('reads the vendor segment and ignores wrapper bundle IDs', () => {
        expect(getBundleVendor('com.blackmagic-design.DiskSpeedTest')).toBe('blackmagicdesign')
        expect(getBundleVendor('at.co.vsl.viennaensemblepro')).toBe('vsl')
        expect(getBundleVendor('unity.Blizzard Entertainment.Hearthstone')).toBe('blizzardentertainment')
        expect(getBundleVendor('com.electron.plutotv')).toBe('')
        expect(getBundleVendor('com.apple.automator.Win-Steam')).toBe('')
        expect(getBundleVendor('TODO')).toBe('')
    })

    it('skips any two-letter country code and the second level under it', () => {
        expect(getBundleVendor('se.propellerheads.reason')).toBe('propellerheads')
        expect(getBundleVendor('au.com.example.app')).toBe('example')
        expect(getBundleVendor('kr.co.vcnc.couple.mac')).toBe('vcnc')
        expect(getBundleVendor('us.zoom.xos')).toBe('zoom')
        expect(getBundleVendor('com.if.Amphetamine')).toBe('if')
        expect(getBundleVendor('notion.id')).toBe('notion')
        expect(getBundleVendor('au.id.example.app')).toBe('example')
        expect(getBundleVendor('es.gob.example.app')).toBe('example')
    })

    it('skips generic domain words after the top level but never the last segment', () => {
        expect(getBundleVendor('com.design.spline')).toBe('spline')
        expect(getBundleVendor('app.seashore')).toBe('seashore')
        expect(getBundleVendor('com.blackmagic-design.DiskSpeedTest')).toBe('blackmagicdesign')
    })
})

describe('Slug claims when two scans share a display name', () => {
    it('ranks wrappers, Chrome web-app stubs and vendorless IDs lowest', () => {
        expect(getSlugClaimStrength('com.google.Chrome.app.akpamiohjfcnimfljfndmaldlcfphjmp', 'Instagram')).toBe(0)
        expect(getSlugClaimStrength('com.electron.nativefier.discord-nativefier-18566a', 'Discord')).toBe(0)
        expect(getSlugClaimStrength('com.yourcompany.CHITUBOX', 'CHITUBOX')).toBe(0)
        expect(getSlugClaimStrength('com.telephoto.identifier', 'MPlayerX')).toBe(0)
        expect(getSlugClaimStrength('WhatsApp', 'Telegram')).toBe(0)
        expect(getSlugClaimStrength('com.mosyle.macos.business', 'Self-Service')).toBe(1)
        expect(getSlugClaimStrength('IPScanner', 'IP Scanner')).toBe(2)
        expect(getSlugClaimStrength('org.niltsh.MPlayerX', 'MPlayerX')).toBe(2)
        expect(getSlugClaimStrength('com.instagram', 'instagram')).toBe(3)
        expect(getSlugClaimStrength('tv.plex.desktop', 'Plex')).toBe(3)
        // The vendor must be the name or one of its words, not a substring
        expect(getSlugClaimStrength('com.apphousekitchen.aldente-pro', 'App')).not.toBe(3)
    })

    it('near-equal claims keep feed order, so existing pages keep their scan', () => {
        const scan = (bundleId, name, version) => ({ bundleId, name, version })
        // qView: the later, native v6.1 build keeps the page over an older ID equal to the name
        expect(laterScanTakesSlug(scan('com.qview.qView', 'qView', '4.00'), scan('com.interversehq.qView', 'qView', '6.1'))).toBe(true)
        expect(laterScanTakesSlug(scan('com.jamfsoftware.selfservice.mac', 'Self Service', '10.32.2'), scan('com.mosyle.macos.business', 'Self-Service', '6.12.12'))).toBe(true)
        expect(laterScanTakesSlug(scan('net.delsuc.pdftoolkit', 'PDF Toolkit+', '2.40'), scan('com.fxcoudert.pdftools', 'PDF Toolkit', '1.80'))).toBe(true)
        expect(laterScanTakesSlug(scan('com.vk.messenger', 'VK Messenger', '5.2.3'), scan('com.vk.messages', 'VK Messenger', '5.3.2'))).toBe(true)
        expect(laterScanTakesSlug(scan('com.10baseT.IPScannerMac', 'IP Scanner', '4.00'), scan('IPScanner', 'IP Scanner', '4.00'))).toBe(true)
    })

    it('a clearly stronger claim, or a version over none, keeps the slug', () => {
        const scan = (bundleId, name, version) => ({ bundleId, name, version })
        expect(laterScanTakesSlug(scan('io.nwjs.nwjs', 'nwjs', '115'), scan('pt.vodafone.webapp', 'nwjs', '87'))).toBe(false)
        expect(laterScanTakesSlug(scan('tv.plex.desktop', 'Plex', '1.74.1'), scan('sddda.Plex', 'Plex', ''))).toBe(false)
        expect(laterScanTakesSlug(scan('org.niltsh.MPlayerX', 'MPlayerX', '1.0.14'), scan('com.telephoto.identifier', 'MPlayerX', '107.114'))).toBe(false)
        expect(laterScanTakesSlug(scan('com.1password.1password', '1Password', '8.10.9'), scan('com.agilebits.onepassword-osx', '1Password', '6.8.9'))).toBe(false)
        expect(laterScanTakesSlug(scan('com.instagram', 'instagram', '4.1.1.1'), scan('com.google.Chrome.app.akpamiohjfcnimfljfndmaldlcfphjmp', 'Instagram', ''))).toBe(false)
        // Same claim, no version on the later scan: feed order still wins
        expect(laterScanTakesSlug(scan('com.netacad.PacketTracer8.1.1', 'Cisco Packet Tracer', '8.1.1'), scan('com.netacad.PacketTracer8.2.2', 'Cisco Packet Tracer', ''))).toBe(true)
    })

    it('keeps the stronger claim regardless of feed order, and the later scan on a tie', () => {
        const feedScan = (id, name) => ({ bundleIdentifier: id, aliases: [name], downloadUrl: null, Date: '2026-01-01T00:00:00.000Z', 'App Version': '1', Result: '✅' })
        for (const order of [[0, 1], [1, 0]]) {
            const pair = [feedScan('com.instagram', 'instagram'), feedScan('com.google.Chrome.app.akpamiohjfcnimfljfndmaldlcfphjmp', 'Instagram')]
            expect(buildScanListMap(order.map(i => pair[i])).get('instagram').bundleIds).toEqual(['com.instagram'])
        }
        const tie = buildScanListMap([feedScan('com.uaudio.console2', 'Console'), feedScan('com.apple.Console', 'Console')])
        expect(tie.get('console').bundleIds).toEqual(['com.apple.Console'])
    })
})

describe('README entries keep other products separate', () => {
    it('.NET does not absorb Battle.net, Wargaming.net or a blank-alias scan', () => {
        const url = 'https://dotnet.microsoft.com/download'
        expect(matches('.NET', url, makeScan(['Battle.net', 'Battle', 'Battle App'], 'net.battle.app'))).toBe(false)
        expect(matches('.NET', url, makeScan(['Wargaming.net Game Center', 'Wargaming', 'Codeweavers Wargaminggamecenter'], 'com.codeweavers.wargaminggamecenter'))).toBe(false)
        expect(matches('.NET', url, makeScan(['Multipass', ''], ''))).toBe(false)
    })

    it('Steam keeps Steam Link but not other vendors or an Automator stub', () => {
        const url = 'https://store.steampowered.com/about/'
        const steam = makeScan(['Steam', 'steam_osx', 'Valvesoftware Steam'], 'com.valvesoftware.steam')
        const steamLink = makeScan(['Steam Link', 'Valvesoftware SteamLink17'], 'com.valvesoftware.SteamLink17')
        const kingdomRush = makeScan(['Kingdom Rush Vengeance', 'Ironhidegames Vengance Mac Steam'], 'com.ironhidegames.vengance.mac.steam')
        const winSteam = makeScan(['Win-Steam', 'Automator Application Stub', 'Apple Automator Win-Steam'], 'com.apple.automator.Win-Steam')

        const { listings, scanListMap } = build([['Steam', url]], [
            ['steam', steam], ['steam-link', steamLink], ['kingdom-rush-vengeance', kingdomRush], ['win-steam', winSteam]
        ])

        expect(listings[0].bundleIds).toEqual(['com.valvesoftware.steam', 'com.valvesoftware.SteamLink17'])
        expect(scanListMap.get('kingdom-rush-vengeance')).toBe(kingdomRush)
        expect(scanListMap.get('win-steam')).toBe(winSteam)
    })

    it('a vendor-prefixed README name does not absorb an Apple app of the same word', () => {
        expect(matches('Warp Terminal', 'https://www.warp.dev', makeScan(['Terminal', 'Apple Terminal'], 'com.apple.Terminal'))).toBe(false)
        expect(matches('HCL Notes', 'https://www.hcltechsw.com/notes', makeScan(['Notes', 'Apple Notes'], 'com.apple.Notes'))).toBe(false)
        expect(matches('App Preview Video Converter', 'https://apps.apple.com/app/id1', makeScan(['Preview', 'Apple Preview'], 'com.apple.Preview'))).toBe(false)
    })

    it('Aptana Studio and Android Studio do not absorb BrickLink Studio', () => {
        const bricklink = makeScan(['Studio', 'BrickLink Studio'], 'com.BrickLink.Studio')
        expect(matches('Aptana Studio', 'https://github.com/aptana/studio3', bricklink)).toBe(false)
        expect(matches('Android Studio', 'https://developer.android.com/studio', bricklink)).toBe(false)
    })

    it('ignores a secondary alias that is only the vendor word', () => {
        const yandexDisk = makeScan(['Yandex.Disk.2', 'Yandex', 'Ru Yandex Desktop Disk2'], 'ru.yandex.desktop.disk2')
        const maxonApp = makeScan(['Maxon App', 'Maxon', 'Maxon App-manager'], 'net.maxon.app-manager')
        expect(matches('Yandex Browser', 'https://browser.yandex.com', yandexDisk)).toBe(false)
        expect(matches('Maxon Chromatic Displacement', 'https://www.maxon.net/en/red-giant', maxonApp)).toBe(false)
    })

    it('ignores executable-name aliases from other products', () => {
        const tor = makeScan(['Tor Browser', 'firefox', 'Torproject Torbrowser'], 'org.torproject.torbrowser')
        const pluto = makeScan(['PlutoTV', 'Electron', 'Electron Plutotv'], 'com.electron.plutotv')
        const vscodium = makeScan(['VSCodium', 'Electron', 'Visualstudio Code Oss'], 'com.visualstudio.code.oss')
        const helicon = makeScan(['HeliconFocus', 'Focus', 'Heliconsoft Heliconfocus'], 'com.heliconsoft.heliconfocus')
        expect(matches('Firefox', 'https://www.mozilla.org/en-US/firefox/new/', tor)).toBe(false)
        expect(matches('Electron Framework', 'https://www.electronjs.org/releases/stable', pluto)).toBe(false)
        expect(matches('Electron Framework', 'https://www.electronjs.org/releases/stable', vscodium)).toBe(false)
        expect(matches('Focus for Mac', 'https://heyfocus.com/', helicon)).toBe(false)
    })

    it('a short README name does not absorb a longer name from another vendor', () => {
        expect(matches('kitty', 'https://github.com/kovidgoyal/kitty/releases', makeScan(['Hello Kitty', 'SunblinkEntertainment HelloKitty'], 'com.SunblinkEntertainment.HelloKitty'))).toBe(false)
        expect(matches('Spotify', 'https://www.spotify.com', makeScan(['DRmare Spotify Music Converter', 'Drmare Smconverter'], 'com.drmare.smconverter'))).toBe(false)
        expect(matches('Unity', 'https://store.unity.com/download', makeScan(['Hearthstone', 'Unity Blizzard Entertainment Hearthstone'], 'unity.Blizzard Entertainment.Hearthstone'))).toBe(false)
        expect(matches('FontBook', 'https://www.lemkesoft.de/en/products/fontbook/download/', makeScan(['Font Book', 'Apple FontBook'], 'com.apple.FontBook'))).toBe(false)
        expect(matches('QQ音乐(QQ Music)', 'https://apps.apple.com/cn/app/id595615424', makeScan(['QQ', 'Tencent Qq'], 'com.tencent.qq'))).toBe(false)
    })

    it('listed pairs stay separate even though the names line up', () => {
        expect(matches('Vienna', 'https://github.com/ViennaRSS/vienna-rss/releases/latest', makeScan(['Vienna Ensemble Pro', 'At Co Vsl Viennaensemblepro'], 'at.co.vsl.viennaensemblepro'))).toBe(false)
        expect(matches('Mail Designer 365', 'https://maildesigner365.com', makeScan(['Mail', 'Apple Mail'], 'com.apple.mail'))).toBe(false)
        expect(matches('Session for Mac', 'https://www.stayinsession.com/', makeScan(['Session', 'Loki-project Messenger-desktop'], 'com.loki-project.messenger-desktop'))).toBe(false)
    })

    it('a scan released by a wrong entry goes to its own README entry', () => {
        const safari = makeScan(['Safari', 'Apple Safari'], 'com.apple.Safari')
        const { listings, scanListMap } = build([
            ['AdBlock Pro for Safari', 'https://apps.apple.com/app/id1018301773'],
            ['Safari Web Browser', 'https://www.apple.com/safari/']
        ], [['safari', safari]])

        expect(listings[0].bundleIds).toEqual([])
        expect(listings[1].bundleIds).toEqual(['com.apple.Safari'])
        expect(scanListMap.size).toBe(0)
    })
})

describe('Each scan goes to its best README entry', () => {
    const lightroom = ['Lightroom', 'https://www.adobe.com/products/photoshop-lightroom.html']
    const lightroomClassic = ['Lightroom Classic', 'https://www.adobe.com/products/photoshop-lightroom-classic.html']
    const classicScan = () => makeScan(['Adobe Lightroom Classic', 'Adobe LightroomClassicCC7'], 'com.adobe.LightroomClassicCC7')

    it('prefers an exact name over a shorter partial match, in either file order', () => {
        const skypeForBusiness = makeScan(['Skype for Business', 'Microsoft SkypeForBusiness'], 'com.microsoft.SkypeForBusiness')
        for (const order of [[0, 1], [1, 0]]) {
            const entries = [['Skype', 'https://www.skype.com/en/get-skype/'], ['Skype for Business', 'https://www.microsoft.com/skype-for-business']]
            const { listings } = build(order.map(i => entries[i]), [['skype-for-business', skypeForBusiness]])
            expect(listings.find(listing => listing.name === 'Skype for Business').bundleIds).toEqual(['com.microsoft.SkypeForBusiness'])
            expect(listings.find(listing => listing.name === 'Skype').bundleIds).toEqual([])
        }
    })

    it('prefers the entry with more of its words in the scan', () => {
        const { listings } = build([lightroom, lightroomClassic], [['adobe-lightroom-classic', classicScan()]])
        expect(listings[0].bundleIds).toEqual([])
        expect(listings[1].bundleIds).toEqual(['com.adobe.LightroomClassicCC7'])

        const acrobat = makeScan(['Acrobat', 'AdobeAcrobat', 'Adobe Acrobat', 'Adobe Acrobat Pro'], 'com.adobe.Acrobat.Pro')
        const result = build([['Acrobat Reader', 'https://get.adobe.com/reader/'], ['Acrobat Pro', 'https://acrobat.adobe.com/']], [['acrobat', acrobat]])
        expect(result.listings[1].bundleIds).toEqual(['com.adobe.Acrobat.Pro'])
    })

    it('ranks an entry by the best alias it accepts, not the first', () => {
        const code = makeScan(['Code', 'Visual Studio Code', 'Microsoft VSCode'], 'com.microsoft.VSCode')
        const { listings } = build([['Code', 'https://example.org/code'], ['Visual Studio Code', 'https://visualstudio.microsoft.com/']], [['code', code]])
        expect(listings[1].bundleIds).toEqual(['com.microsoft.VSCode'])
    })

    it('falls back to file order when two entries match equally well', () => {
        const insomnia = makeScan(['Insomnia', 'Insomnia App'], 'com.insomnia.app')
        const { listings } = build([['Insomnia Core', 'https://insomnia.rest/download/'], ['Insomnia Designer', 'https://insomnia.rest/products/designer']], [['insomnia', insomnia]])
        expect(listings[0].bundleIds).toEqual(['com.insomnia.app'])
    })

    it('prefers the full name over a name without its parenthesised qualifier', () => {
        const comic = makeScan(['Simple Comic', 'ToWatchList SimpleComic'], 'com.ToWatchList.SimpleComic')
        const { listings } = build([['Simple Comic (Community Fork)', 'https://github.com/arauchfuss/Simple-Comic'], ['Simple Comic', 'https://dancingtortoise.com/simplecomic/']], [['simple-comic', comic]])
        expect(listings[1].bundleIds).toEqual(['com.ToWatchList.SimpleComic'])
    })
})

describe('Vendor evidence beyond the bundle ID', () => {
    it('uses the scan download host: 10base-t IP Scanner is not Angry IP Scanner', () => {
        const ipScanner = { ...makeScan(['IP Scanner', 'IPScanner'], 'IPScanner'), relatedLinks: [{ label: 'View', href: 'https://10base-t.com' }] }
        expect(matches('Angry IP Scanner', 'https://angryip.org/download/#mac', ipScanner)).toBe(false)
    })

    it('reads a download host that is one squashed word', () => {
        const ipScanner = { ...makeScan(['IP Scanner', 'IPScanner'], 'IPScanner'), relatedLinks: [{ label: 'View', href: 'https://angryip.org/' }] }
        expect(matches('Angry IP Scanner', 'https://angryip.org/download/#mac', ipScanner)).toBe(true)
    })

    it('needs the joined leading words, four letters or more, to start the host, and only without a vendor', () => {
        const withLink = (scan, href) => ({ ...scan, relatedLinks: [{ label: 'View', href }] })
        expect(matches('Mac Fan Control', 'https://crystalidea.com/macs-fan-control', withLink(makeScan(['Fan Control', 'FanControl'], 'FanControl'), 'https://www.macupdate.com/app/mac/1'))).toBe(false)
        expect(matches('Pro Tools', 'https://www.avid.com/pro-tools', withLink(makeScan(['Tools', 'Tools'], 'Tools'), 'https://protoolsapp-downloads.com/'))).toBe(false)
        expect(matches('Angry IP Scanner', 'https://angryip.org/download/#mac', withLink(makeScan(['IP Scanner', 'Other IPScanner'], 'com.other.IPScanner'), 'https://angryip.org/'))).toBe(false)
    })

    it('keeps a scan with no vendor and no download link: Autokroma Influx', () => {
        expect(matches('Autokroma Influx', 'https://www.autokroma.com/Influx/', makeScan(['Influx', 'TODO'], 'TODO'))).toBe(true)
    })

    it('takes a vendor-plus-name scan when the README link names no vendor', () => {
        const proTools = makeScan(['Avid Pro Tools', 'Avid ProTools'], 'com.avid.ProTools')
        expect(matches('Pro Tools', 'https://apps.apple.com/app/id1', proTools)).toBe(true)
        expect(matches('Pro Tools', 'https://www.avid.com/pro-tools', proTools)).toBe(true)
        expect(matches('FontBook', 'https://www.lemkesoft.de/en/products/fontbook/', makeScan(['Font Book', 'Apple FontBook'], 'com.apple.FontBook'))).toBe(false)
    })

    it('a scan name that starts with the README name still counts', () => {
        expect(matches('Things', 'https://culturedcode.com/things/', makeScan(['Things 3', 'Culturedcode ThingsMac'], 'com.culturedcode.ThingsMac'))).toBe(true)
    })

    it('Fluid wrappers, CrossOver launchers and default Electron IDs never match partially', () => {
        expect(matches('Final Cut Library Manager', 'https://www.arcticwhiteness.com/finalcutlibrarymanager/', makeScan(['Library', 'FluidApp', 'Fluidapp FluidApp2 Library'], 'com.fluidapp.FluidApp2.Library'))).toBe(false)
        expect(matches('Steam', 'https://store.steampowered.com/about/', makeScan(['Steam (Rocket League)', 'Menu Helper', 'Codeweavers CrossOverHelper 363F'], 'com.codeweavers.CrossOverHelper.363F.D7B4'))).toBe(false)
        expect(matches('Lens Studio', 'https://lensstudio.snapchat.com/download/', makeScan(['Lens', 'Electron Kontena-lens'], 'com.electron.kontena-lens'))).toBe(false)
        expect(matches('React Native Debugger', 'https://github.com/jhen0409/react-native-debugger', makeScan(['React Native Debugger', 'Electron React-native-debugger'], 'com.electron.react-native-debugger'))).toBe(true)
    })
})

describe('SEPARATE_PRODUCTS', () => {
    it('every key is still a README entry', () => {
        const readmeNames = new Set([...fs.readFileSync('README.md', 'utf8').matchAll(/^\* \[(.+?)\]\(/gm)].map(match => match[1]))
        for (const name of SEPARATE_PRODUCTS.keys()) {
            expect(readmeNames.has(name), `SEPARATE_PRODUCTS key "${name}" is not in README.md`).toBe(true)
        }
    })

    it('Testlum Desktop is kept apart without blocking IntelliJ Community itself', () => {
        expect(matches('IntelliJ IDEA', 'https://www.jetbrains.com/idea/download/', makeScan(['Testlum Desktop', 'idea', 'Jetbrains Intellij Ce'], 'com.jetbrains.intellij.ce'))).toBe(false)
        expect(matches('IntelliJ IDEA', 'https://www.jetbrains.com/idea/download/', makeScan(['Testlum Desktop 2', 'idea', 'Jetbrains Intellij Ce'], 'com.jetbrains.intellij.ce'))).toBe(false)
        expect(matches('IntelliJ IDEA', 'https://www.jetbrains.com/idea/download/', makeScan(['IntelliJ IDEA CE', 'idea', 'Jetbrains Intellij Ce'], 'com.jetbrains.intellij.ce'))).toBe(true)
    })
})

describe('Owners pinned from the real scans feed', () => {
    // Rebuild listings from the fixture and classify every scan the same way
    // the fixture does: absorbed, own listing, or dropped by a slug clash
    const slugWinners = buildScanListMap(ownersFixture.scans)
    const scanListMap = buildScanListMap(ownersFixture.scans)
    const listings = buildReadmeAppList({ readmeContent: ownersFixture.readme, scanListMap, commits: [] })
    const owners = new Map()
    for (const listing of listings) for (const id of listing.bundleIds) owners.set(id, listing.name)

    function stateOf (scan) {
        const id = scan.bundleIdentifier ?? ''
        const slug = makeSlug(scan.aliases[0])
        const winner = slugWinners.get(slug)

        if (!winner || winner.bundleIds[0] !== scan.bundleIdentifier) return { dropped: true, slugKeptBy: winner ? winner.bundleIds[0] : null }
        if (owners.has(id)) return { readmeEntry: owners.get(id) }
        return { ownListing: '/app/' + slug }
    }

    for (const scan of ownersFixture.scans) {
        const key = `${scan.bundleIdentifier ?? ''}|${scan.aliases[0]}`
        const expected = ownersFixture.expected[key]
        it(`${key} ${JSON.stringify(expected)}`, () => {
            expect(stateOf(scan)).toEqual(expected)
        })
    }

    it('real apps keep their slug over wrappers, web-app stubs and unrelated IDs', () => {
        const realApps = ['com.hnc.Discord|Discord', 'org.wireshark.Wireshark|Wireshark', 'com.instagram|instagram', 'tv.plex.desktop|Plex', 'io.nwjs.nwjs|nwjs', 'org.niltsh.MPlayerX|MPlayerX', 'com.1password.1password|1Password',
            // Existing pages that keep the scan they showed before (near-equal claims keep feed order)
            'com.interversehq.qView|qView', 'com.mosyle.macos.business|Self-Service', 'com.fxcoudert.pdftools|PDF Toolkit', 'com.vk.messages|VK Messenger', 'IPScanner|IP Scanner']
        for (const key of realApps) {
            expect(ownersFixture.expected[key], key).toBeDefined()
            expect(ownersFixture.expected[key].dropped, key).toBeUndefined()
        }
    })
})

describe('README entries still absorb their own scans', () => {
    const cases = [
        ['Arduino IDE', 'https://www.arduino.cc/en/software', ['Arduino', 'Cc Arduino Arduino'], 'cc.arduino.Arduino'],
        ['Charles Web Debugging Proxy', 'https://www.charlesproxy.com/download/', ['Charles', 'Xk72 Charles'], 'com.xk72.Charles'],
        ['Timing for Mac', 'https://timingapp.com', ['Timing', 'Info Eurocomp Timing2'], 'info.eurocomp.Timing2'],
        ['Discord', 'https://discord.com/download', ['Discord PTB', 'Hnc DiscordPTB'], 'com.hnc.DiscordPTB'],
        ['Lightroom', 'https://www.adobe.com/products/photoshop-lightroom.html', ['Adobe Lightroom', 'Adobe LightroomCC'], 'com.adobe.lightroomCC'],
        ['Spectrasonics Keyscape', 'https://www.spectrasonics.net/products/keyscape/', ['Keyscape', 'Spectrasonics Keyscapestandalone'], 'com.spectrasonics.keyscapestandalone'],
        ['VS Code', 'https://code.visualstudio.com/', ['Code', 'Visual Studio Code', 'Microsoft VSCode'], 'com.microsoft.VSCode'],
        ['X Lossless Decoder (XLD)', 'https://sourceforge.net/projects/xld/', ['XLD', 'Jp Tmkk XLD'], 'jp.tmkk.XLD'],
        ['Maxon PluralEyes', 'https://www.maxon.net/en/pluraleyes', ['PluralEyes', 'PluralEyes 4', 'Redgiant PluralEyes-4'], 'com.redgiant.PluralEyes-4'],
        ['Rhinoceros 3D', 'https://www.rhino3d.com/download/', ['Rhino 7', 'Rhinoceros', 'Mcneel Rhinoceros 7'], 'com.mcneel.rhinoceros.7'],
        ['Autokroma Influx', 'https://www.autokroma.com/Influx/', ['Influx', 'TODO'], 'TODO'],
        ['TeamViewer', 'https://www.teamviewer.com/en/download/mac-os/', ['TeamViewerHost', 'Teamviewer TeamViewerHost'], 'com.teamviewer.TeamViewerHost'],
        ['Zoom', 'https://zoom.us/download', ['ZoomVDI', 'Us Zoom ZoomVDI'], 'us.zoom.ZoomVDI'],
        ['iTerm', 'https://iterm2.com/', ['iTerm2', 'iTerm', 'Googlecode Iterm2'], 'com.googlecode.iterm2'],
        ['Notion Desktop', 'https://www.notion.so/desktop', ['Notion', 'Notion Id'], 'notion.id'],
        ['NVIDIA GeForce NOW', 'https://www.nvidia.com/en-us/geforce-now/download/', ['GeForceNOW', 'GeForce NOW', 'Nvidia Gfnpc Mall'], 'com.nvidia.gfnpc.mall'],
    ]

    for (const [name, url, aliases, id] of cases) {
        it(`${name} absorbs ${aliases[0]}`, () => {
            expect(matches(name, url, makeScan(aliases, id))).toBe(true)
        })
    }
})

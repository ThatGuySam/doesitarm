// Copy, headline experiments and placement rules for Does It ARM services.
// Edit wording here. Variant ids are stored with every impression and click,
// so give a reworded headline a new id instead of reusing an old one.

import { apps as revivalApps } from '~/data/revival-apps.json'

export const serviceEventsEndpoint = 'https://doesitarm.com/api/subscriptions/service-events'
export const serviceRequestsEndpoint = 'https://doesitarm.com/api/subscriptions/service-requests'

export const auditPagePath = '/services/studio-upgrade-audit/'

// Cloudflare Turnstile widget "Does It ARM services" (doesitarm.com, cf.doesitarm.com, localhost).
// The site key is public. The secret is the subscriptions Worker secret TURNSTILE_SECRET.
// Set this to '' to turn the widget off; the Worker skips the check while its secret is unset.
export const turnstileSiteKey = '0x4AAAAAAGWhwBrgzHSl1Hff'

// These alerts can come from a dependency even when the listed app is native.
const intelDependencyVariants = [
    { id: 'mq1', headline: 'Seeing “Support Ending for Intel-based Apps”?', active: false },
    { id: 'rq1', headline: 'Seeing “you need to install Rosetta”?', active: false },
    { id: 'rq2', headline: 'Are you seeing “you need to install Rosetta”?', active: false },
    { id: 'intel-plugin', headline: 'Does macOS flag a plug-in as Intel-only?' },
    { id: 'rosetta-plugin', headline: 'Does an older plug-in still need Rosetta?' },
    { id: 'rosetta-installer', headline: 'Does a plug-in installer ask for Rosetta?' }
]

// Headline experiments. Each browser gets ONE variant per experiment, picked at
// random from the active variants and kept in localStorage under the experiment
// id, so it sees the same headline on every page and card type in that experiment.
// Each card type in an experiment must have a headline for every variant: set
// `headline`, and `byCard[<card type>]` where one card type needs other words.
// Retire a variant with `active: false` (keep it here so its id is not reused).
// macOS message quotes, checked 2026-11-27:
// - "Support Ending for Intel-based Apps" is the title of the notification macOS
//   26.4+ shows when Intel code launches (body: 'This version of "App" will not
//   open in a future release of macOS.'). Six Colors, PaperCut KB, Adobe forum.
//   https://sixcolors.com/post/2026/08/preparing-for-next-years-rosetta-2-demise/
// - "you need to install Rosetta" is part of the alert 'To open "App", you need
//   to install Rosetta. Do you want to install it now?' (Apple shows it as an
//   image in https://support.apple.com/en-us/102527; text from WD support 49371).
export const serviceExperiments = {
    // Every non-Logic audio card: generic audio tools and non-Logic DAWs
    'audio-headlines-v2': {
        control: 'd1',
        variants: [
            { id: 'd1', headline: 'Check your plug-ins before you upgrade.' },
            { id: 'op1', headline: 'Will your old projects still play?' },
            { id: 'so1', headline: 'Will your sessions open on the new Mac?' },
            { id: 'ks1', headline: 'Keep your saved settings when you move Macs.' },
            { id: 'mw1', headline: 'Move now or wait? Get a clear answer.' },
            { id: 'ri1', headline: 'Know what to reinstall before your new Mac.' },
            { id: 'cw1', headline: 'Will last year’s client mixes still open?' },
            { id: 'ls1', headline: 'Do your plug-ins load, not just show up?' },
            { id: 'up1', headline: 'Update only the plug-ins you actually need.' },
            { id: 'es1', headline: 'Will your old projects open with every sound?' },
            { id: 'rs1', headline: 'Upgrading macOS? Check one real session first.' },
            { id: 'rt1', headline: 'Retire the old Mac when you’re sure.' },
            {
                id: 'mv1',
                headline: 'Moving your projects to a new Mac?',
                byCard: { daw: 'Moving your {app} projects to a new Mac?' }
            },
            { id: 'nm1', headline: 'Ordering a new Mac?' },
            { id: 'cp1', headline: 'Is your Mac ready to reopen that client project?' },
            ...intelDependencyVariants
        ]
    },
    // Logic Pro and MainStage pages
    'logic-headlines-v2': {
        control: 'na1',
        variants: [
            // {app} becomes the listing name, e.g. "Logic Pro runs natively."
            { id: 'na1', headline: '{app} runs natively. Do your sessions?' },
            { id: 'lp1', headline: 'Will your old Logic projects still play?' },
            { id: 'a1', headline: 'Moving your Logic sessions to a new Mac?' },
            { id: 'd1', headline: 'Check your plug-ins before you upgrade.' },
            { id: 'so1', headline: 'Will your sessions open on the new Mac?' },
            { id: 'mw1', headline: 'Move now or wait? Get a clear answer.' },
            { id: 'up1', headline: 'Update only the plug-ins you actually need.' },
            { id: 'ls1', headline: 'Do your plug-ins load, not just show up?' },
            { id: 'cw1', headline: 'Will last year’s client mixes still open?' },
            { id: 'nm1', headline: 'Ordering a new Mac?' },
            { id: 'cp1', headline: 'Is your Mac ready to reopen that client project?' },
            ...intelDependencyVariants
        ]
    },
    'revival-v1': {
        control: 'r1',
        variants: [
            { id: 'r1', headline: 'Still depend on {app}?' }
        ]
    }
}

// One card per type. The subhead and buttons stay fixed within an experiment,
// so the headline is the only thing that varies.
export const serviceCards = {
    // Other audio software: plug-in managers, instruments, editors. No DAW named.
    'audio': {
        offer: 'studio-upgrade-audit',
        experiment: 'audio-headlines-v2',
        subhead: 'Logic first. We review other hosts case by case.',
        primary: { label: 'See audit scope', href: auditPagePath },
        secondary: { label: 'Email me when audits open' }
    },
    // DAWs and hosts other than Logic, native or not (REAPER, Ableton, Pro Tools, Audacity...)
    'daw': {
        offer: 'studio-upgrade-audit',
        experiment: 'audio-headlines-v2',
        subhead: 'Logic first. We review other hosts case by case.',
        primary: { label: 'See audit scope', href: auditPagePath },
        secondary: { label: 'Email me when audits open' }
    },
    // Logic Pro and MainStage
    'logic-native': {
        offer: 'studio-upgrade-audit',
        experiment: 'logic-headlines-v2',
        subhead: 'One Logic session and its plug-ins.',
        primary: { label: 'Logic upgrade audit', href: auditPagePath },
        secondary: { label: 'Audit waitlist' }
    },
    // Discontinued apps (data/revival-apps.json or a listing that says discontinued)
    'revival': {
        offer: 'app-revival',
        experiment: 'revival-v1',
        subhead: 'It’s discontinued. Tell us what you still use it for.',
        primary: { label: 'I still need this app' },
        // The listing slug is added as ?app=, which prefills the request form there
        secondary: { label: 'How revival requests work', href: '/services/abandoned-app-revival/' }
    }
}

// Active headline variants for a card type, in pool order (control first)
export function getCardVariants ( type ) {
    const card = serviceCards[ type ]
    const experiment = card && serviceExperiments[ card.experiment ]
    if ( !experiment ) return []

    return experiment.variants
        .filter( variant => variant.active !== false )
        .map( variant => ( { id: variant.id, headline: variant.byCard?.[ type ] || variant.headline } ) )
}

// Discontinued apps that show the free revival interest card. The reviewed list
// with the evidence for each app is data/revival-apps.json. Add an app only when
// it is clearly abandoned, never one that is still maintained.
export const revivalAllowlist = /* @__PURE__ */ revivalApps.map( app => app.slug )

// A listing whose own status text says the app is dead also gets the revival card,
// e.g. "🚫 Reported not working on Apple Silicon; discontinued"
const abandonedTextPattern = /\b(?:discontinued|abandoned|retired|end[- ]of[- ]life|no longer (?:maintained|developed|in development))\b/i

export function isAbandonedListing ( listing ) {
    const slug = getListingSlug( listing )
    if ( !slug ) return false
    if ( revivalAllowlist.includes( slug ) ) return true

    return typeof listing?.text === 'string' && abandonedTextPattern.test( listing.text )
}

export const audioCategorySlug = 'music-and-audio-tools'

// Logic itself keeps the Logic-specific card
export const logicAppSlugs = [ 'logic-pro', 'mainstage' ]

// DAWs and hosts other than Logic, native or not. The 'daw' headline can name the app.
export const dawAppSlugs = [
    'ableton', 'avid-pro-tools', 'cubase', 'fl-studio', 'studio-one', 'reaper',
    'bitwig-studio', 'garageband', 'reason', 'n-track-studio', 'ardour', 'audacity',
    'adobe-audition', 'mixcraft', 'digital-performer', 'renoise', 'hindenburg'
]

// Audio apps outside Music and Audio Tools (many come from app scans and have
// no category). Checked against live /app/ pages on 2026-11-27.
export const audioAppSlugs = [
    ...logicAppSlugs,
    ...dawAppSlugs,
    'melodyne', 'native-access', 'massive', 'spectrasonics-omnisphere', 'spectrasonics-keyscape',
    'spectrasonics-trilian', 'spectrasonics-stylus-rmx', 'waves-central', 'spitfire-audio',
    'ilok-license-manager', 'ua-connect', 'universal-audio-software', 'arturia-software-center',
    'amplitube-5', 'toontrack-product-manager', 'superior-drummer-3', 'addictive-drums-2',
    'xln-online-installer', 'slate-digital-connect', 'focusrite-control', 'universal-control', 'splice',
    'vital', 'surge-xt', 'loopback'
]

// Playback, listening, practice and standalone diagnostics were reviewed by app.
// Uninstallers are excluded by role even when a vendor name matches audioNameTerms.
const studioAuditExcludedSlugs = new Set([
    'airfoil', 'auralia-5-student', 'bitperfect', 'capo', 'colibri', 'colibri-dac-dsd-test',
    'foobar2000', 'forscore', 'fretello', 'instuner', 'kugoumusic', 'midi-player',
    'motu-audio-tools', 'noizio', 'pine-player', 'silicio', 'somafm', 'tunesart',
    'ultimate-guitar-chords-and-tabs', 'whatson'
])
const uninstallerPattern = /^(?:remove[ -])|\buninstall(?:er)?\b/

// Whole-word matches on a listing's name or aliases
const audioNameTerms = [
    'melodyne', 'celemony', 'native access', 'native instruments', 'kontakt', 'komplete', 'maschine',
    'reaktor', 'omnisphere', 'keyscape', 'spectrasonics', 'serum', 'xfer', 'waves central',
    'izotope', 'ozone', 'ableton', 'pro tools', 'cubase', 'nuendo', 'steinberg', 'fl studio',
    'studio one', 'presonus', 'reaper', 'mainstage', 'garageband', 'logic pro', 'uad',
    'universal audio', 'luna recording', 'arturia', 'spitfire', 'ilok', 'bitwig', 'fabfilter',
    'soundtoys', 'plugin alliance', 'slate digital', 'toontrack', 'superior drummer',
    'addictive drums', 'amplitube', 'auto-tune', 'antares', 'eventide', 'valhalla', 'u-he',
    'output hub', 'eastwest', 'vienna symphonic', 'audacity', 'ardour', 'adobe audition',
    'digital performer', 'mixcraft', 'renoise', 'tracktion', 'hindenburg'
]
const dawNameTerms = [
    'ableton', 'pro tools', 'cubase', 'nuendo', 'fl studio', 'studio one', 'reaper', 'bitwig',
    'luna recording', 'audacity', 'ardour', 'garageband', 'adobe audition', 'digital performer',
    'mixcraft', 'renoise', 'tracktion', 'hindenburg'
]

// Home page search terms that show the audio card
export const audioSearchTerms = [
    'logic', 'ableton', 'pro tools', 'protools', 'plugin', 'plugins', 'plug-in', 'plug-ins',
    'vst', 'vst2', 'vst3', 'au', 'aax', 'daw', 'kontakt', 'serum', 'native instruments',
    'waves', 'izotope', 'melodyne', 'omnisphere', 'synth', 'synths', 'audio', 'music',
    'mixing', 'mastering', 'mainstage', 'garageband', 'cubase', 'bitwig', 'reaper',
    'studio one', 'fl studio', 'spectrasonics', 'fabfilter', 'arturia', 'uad', 'soundtoys'
]

const escapeRegex = text => text.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' )

const audioSearchPattern = new RegExp(
    `(?:^|[^a-z0-9])(?:${ audioSearchTerms.map( escapeRegex ).join( '|' ) })(?:$|[^a-z0-9])`
)

export function isAudioSearchQuery ( query ) {
    if ( typeof query !== 'string' ) return false

    return audioSearchPattern.test( query.toLowerCase().trim() )
}

export function getListingSlug ( listing ) {
    const match = /^\/app\/([a-z0-9-]+)/.exec( listing?.endpoint || '' )

    return match ? match[1] : null
}

const termsPattern = terms => new RegExp(
    `(?:^|[^a-z0-9])(?:${ terms.map( escapeRegex ).join( '|' ) })(?:$|[^a-z0-9])`
)
const audioNamePattern = termsPattern( audioNameTerms )
const dawNamePattern = termsPattern( dawNameTerms )

function listingNames ( listing ) {
    const aliases = Array.isArray( listing?.aliases ) ? listing.aliases : []

    return [ listing?.name, ...aliases ]
        .filter( name => typeof name === 'string' )
        .map( name => name.toLowerCase() )
}

export function isAudioListing ( listing ) {
    const slug = getListingSlug( listing )
    if ( !slug ) return false
    if ( listing?.category?.slug === audioCategorySlug || audioAppSlugs.includes( slug ) ) return true

    return listingNames( listing ).some( name => audioNamePattern.test( name ) )
}

function isDawListing ( listing ) {
    const slug = getListingSlug( listing )
    if ( dawAppSlugs.includes( slug ) ) return true

    return listingNames( listing ).some( name => dawNamePattern.test( name ) )
}

// Pick at most one card for a listing. Games, formulas and devices get none.
export function getServiceCardType ( listing ) {
    const slug = getListingSlug( listing )
    if ( !slug ) return null

    if ( isAbandonedListing( listing ) ) return 'revival'

    if ( studioAuditExcludedSlugs.has( slug ) || uninstallerPattern.test( slug ) ||
        listingNames( listing ).some( name => uninstallerPattern.test( name ) ) ) return null

    if ( !isAudioListing( listing ) ) return null

    // Logic copy only ever shows on Logic Pro and MainStage
    if ( logicAppSlugs.includes( slug ) ) return 'logic-native'

    return isDawListing( listing ) ? 'daw' : 'audio'
}

// Same shape the subscriptions Worker accepts for app_slug
export const appSlugPattern = /^[a-z0-9-]{1,40}$/

// /services/abandoned-app-revival/?app=true-fi prefills the request form for that listing
export function getRevivalRequestPath ( appSlug = '' ) {
    const path = `/services/abandoned-app-revival/`

    return appSlugPattern.test( appSlug ) ? `${ path }?app=${ appSlug }` : path
}

export function fillServiceCopy ( text, { app = '' } = {} ) {
    return text.replaceAll( '{app}', app )
}

// Copy for the audit page
export const auditPage = {
    title: 'Logic upgrade audit',
    subhead: 'We reopen a copy of one Logic session and check the plug-ins it needs to play. Then you get a plan: update, print or wait.',
    scopeSummary: 'We check a copy of one Logic session and up to 15 plug-in versions on one Mac with one target macOS and Logic version.',
    price: '$500 scoped audit',
    primary: 'Check my Logic setup',
    secondary: 'Email me when audits open',
    // Set src to an image or video URL to show it. The page shows no media slot while src is empty.
    media: {
        type: 'image',
        src: '',
        label: 'Logic session walkthrough'
    },
    points: [
        {
            title: 'Your plug-ins',
            text: 'Up to 15 plug-in versions, each marked native, needs Rosetta, needs an update or unresolved.'
        },
        {
            title: 'One real session',
            text: 'We reopen a copy and check that the sounds, presets and settings you name still load.'
        },
        {
            title: 'Move, wait or print',
            text: 'What to update, what to print first, and whether to move now or keep the old Mac a while.'
        }
    ],
    scope: {
        heading: 'Check my Logic setup',
        intro: 'Tell us about your setup. We reply by email to confirm scope before anything is paid.',
        submit: 'Send my setup',
        success: 'Thanks. We’ll reply by email to confirm the scope.'
    },
    waitlist: {
        heading: 'Not ready yet?',
        intro: 'Get one email when audits open.',
        submit: 'Email me when audits open',
        success: 'You’re on the list. We’ll email you when audits open.'
    },
    faq: [
        {
            question: 'What does it cost?',
            answer: '$500 for one Mac, one target macOS and Logic version, one session and up to 15 plug-in versions. We confirm scope before you pay. Plug-in updates are bought separately, and we tell you which ones you actually need.'
        },
        {
            question: 'Free scanners already list my Intel plug-ins. Why pay?',
            answer: 'Use one first. It’s a good start. A scanner reads the plug-in files. We open a copy of a real session and check that its saved sounds and settings load, which a file scan can’t show.'
        },
        {
            question: 'What about iLok and other licenses?',
            answer: 'You stay in control of them. You sign in or move authorizations on your own setup, and we never ask for passwords or license keys. We note which plug-ins are tied to a machine, a USB iLok or iLok Cloud.'
        },
        {
            question: 'Can’t I just keep my old Mac?',
            answer: 'Often, yes, for a while. If waiting is the right call, the plan says so, along with what to print or back up so you can switch later.'
        },
        {
            question: 'Do you need my project files?',
            answer: 'Not to start. Share a copy you’re allowed to share, a stripped-down version, or a screen share where you drive. You keep your working rig in service.'
        },
        {
            question: 'What do I get at the end?',
            answer: 'A dated written report: each plug-in, what we saw on which Mac, macOS and Logic version, and a next step. No badges and no guarantees, just what the test showed.'
        },
        {
            question: 'I use Ableton, Pro Tools, Cubase or REAPER.',
            answer: 'We start with Logic. Name your DAW in the form and we’ll tell you honestly whether we can scope it.'
        },
        {
            question: 'Can you say if macOS 28 will work?',
            answer: 'Not yet. Apple says Rosetta stays available through macOS 27, and after that it plans to keep it only for certain older games. We show what depends on Rosetta today and what to fix first.'
        }
    ]
}

// Short pages for the other offers, served by src/pages/services/[offer].astro.
// Each has one interest form stored in service_requests with its offer id.
export const servicePages = {
    'mac-fleet-readiness': {
        offer: 'mac-fleet-readiness',
        icon: '💼',
        title: 'Mac fleet readiness report',
        tile: 'Turn your MDM export into a rollout plan.',
        headline: 'Turn your Mac inventory into a rollout plan.',
        subhead: 'Send a redacted MDM export. Get a dated report of which Macs can move, what to fix first and which to hold.',
        price: 'From $500 for one inventory, one target macOS and up to 20 priority apps',
        status: 'From $500 · Join the list',
        points: [
            { title: 'Your export', text: 'Start from a redacted Jamf or MDM list. No admin access needed.' },
            { title: 'Priority versions', text: 'Up to 20 apps, plug-ins, installers or drivers checked against your target macOS.' },
            { title: 'A rollout plan', text: 'Upgrade, update, replace, test first or hold, with a next step for each.' }
        ],
        form: {
            heading: 'Get first access to fleet reports',
            intro: 'Leave your email and we’ll reach out when fleet reports open.',
            noteLabel: 'Target macOS and rollout window (optional)',
            notePlaceholder: 'e.g. macOS 27, 120 Macs, by March',
            submit: 'Get first access',
            success: 'You’re on the list. We’ll email you when fleet reports open.'
        },
        faq: [
            { question: 'Do you need MDM admin access?', answer: 'No. The report starts from your export. Hands-on testing is scoped and quoted separately.' },
            { question: 'Our MDM already reports Intel apps. Why pay?', answer: 'Keep using it. It tells you what’s installed. We turn that list into upgrade, update, replace, test first or hold, with the version and next step for each app.' },
            { question: 'What about licensed and plug-in software?', answer: 'We note anything tied to a machine, a dongle or a license server so you can plan reactivation. We never need your license keys.' }
        ]
    },
    'audio-session-rescue': {
        offer: 'audio-session-rescue',
        icon: '🎛️',
        title: 'Old session rescue',
        tile: 'Get stems out of a project that won’t open.',
        headline: 'Get stems out of a session that won’t open.',
        subhead: 'Start with one old project and the last setup that opened it. We test a copy and tell you what can be recovered.',
        price: 'From $500 for one project',
        status: 'From $500 · Join the list',
        points: [
            { title: 'A copy, not your original', text: 'We open a duplicate on an agreed licensed setup and note what loads and what comes up empty.' },
            { title: 'The files you need', text: 'Stems, wet and dry versions or a mix reference, agreed up front.' },
            { title: 'A clear record', text: 'What’s missing, what was substituted and what still needs the old setup.' }
        ],
        form: {
            heading: 'Get first access to session rescue',
            intro: 'Leave your email and we’ll reach out when session rescue opens.',
            noteLabel: 'DAW, version and what you need from it (optional)',
            notePlaceholder: 'e.g. Pro Tools 10 session, need stems',
            submit: 'Get first access',
            success: 'You’re on the list. We’ll email you when session rescue opens.'
        },
        faq: [
            { question: 'What if the old plug-in is gone?', answer: 'A licensed original, an old Mac that still runs it or a printed reference may be enough. We tell you what’s possible before quoting.' },
            { question: 'Do I send my files now?', answer: 'No. Start with the versions and symptoms. If the job fits, we agree on a private way to share files.' },
            { question: 'Will a missing license wipe my inserts?', answer: 'It can. Some DAWs drop a plug-in from its slot when its license is missing. We only work on a copy, with your licenses signed in on your side.' },
            { question: 'My old Mac still opens it. Do I need this?', answer: 'Maybe not. Print stems on the old Mac first. This is for when that can’t give you everything, or the old Mac is already gone.' }
        ]
    },
    'legacy-studio-hardware': {
        offer: 'legacy-studio-hardware',
        icon: '🔌',
        title: 'Studio interface check',
        tile: 'See if your audio interface makes the move.',
        headline: 'Will your audio interface work with a new Mac?',
        subhead: 'We check your exact interface, adapters and macOS against the inputs, clock and controls you actually use.',
        price: 'From $1,000 for one interface and one target Mac',
        status: 'From $1,000 · Join the list',
        points: [
            { title: 'Your I/O', text: 'Two agreed input or output tasks on a licensed test setup.' },
            { title: 'Clock and control', text: 'One clocking or control task, like phantom power or the monitor mix.' },
            { title: 'Keep, bridge or replace', text: 'A clear call, plus rollback steps so your working rig stays safe.' }
        ],
        form: {
            heading: 'Tell me when my interface can be checked',
            intro: 'Leave your email and we’ll reach out when interface checks open.',
            noteLabel: 'Interface model and connection (optional)',
            notePlaceholder: 'e.g. RME Fireface 400, FireWire',
            submit: 'Email me',
            success: 'You’re on the list. We’ll email you when interface checks open.'
        },
        faq: [
            { question: 'Will every FireWire interface work?', answer: 'No. It depends on the model, firmware, adapters, macOS and driver. We scope your exact combination first.' },
            { question: 'Isn’t the maker’s compatibility page enough?', answer: 'Check it first. If it lists your model, macOS and Mac, you may not need us. We help when it’s silent, out of date or your setup uses adapters.' },
            { question: 'Should I just keep my old Mac for this interface?', answer: 'Sometimes that’s the right call. You get keep, bridge or replace, with rollback steps either way.' },
            { question: 'Can you repair a broken interface?', answer: 'No. This checks working hardware. We point you to a repair shop for physical faults.' }
        ]
    },
    'windows-arm-purchase-check': {
        offer: 'windows-arm-purchase-check',
        icon: '🪟',
        title: 'Windows on Arm purchase check',
        tile: 'Test the laptop before you order ten.',
        headline: 'Test the laptop before you order ten.',
        subhead: 'We try your apps, VPN and peripherals on one shortlisted Arm laptop and give you a buy, pilot or hold call.',
        price: 'From $1,000 for one laptop and three key workflows',
        status: 'From $1,000 · Join the list',
        points: [
            { title: 'Your real workflows', text: 'Three tasks your team does every day, like printing or VPN sign-in.' },
            { title: 'Drivers and peripherals', text: 'Up to three printers, scanners or drivers that could block you.' },
            { title: 'Buy, pilot or hold', text: 'A dated report with a pass, workaround or blocker for each task.' }
        ],
        form: {
            heading: 'Get first access to purchase checks',
            intro: 'Leave your email and we’ll reach out when purchase checks open.',
            noteLabel: 'Laptop model and purchase date (optional)',
            notePlaceholder: 'e.g. Surface Laptop, ordering in February',
            submit: 'Get first access',
            success: 'You’re on the list. We’ll email you when purchase checks open.'
        },
        faq: [
            { question: 'Do I need to supply the laptop?', answer: 'Yes, for a hands-on result. Lend or ship the shortlisted model, or ask for an evidence review instead.' },
            { question: 'Can emulation cover a missing driver?', answer: 'Emulation runs many Intel apps, but drivers need their own Arm version. We test each one separately.' },
            { question: 'Can’t we just buy one and try it?', answer: 'You can, and that’s what we do, with a written result per workflow so the decision doesn’t rest on one person’s afternoon.' }
        ]
    },
    'verified-test-report': {
        offer: 'verified-test-report',
        icon: '🧪',
        title: 'Verified test report',
        tile: 'A dated test of your build on a real Mac.',
        headline: 'Put a dated test report behind your Apple Silicon release.',
        subhead: 'We run your build on a named Mac setup and record what passed, what failed and what we didn’t test.',
        price: 'From $350 for one build on one Mac, macOS, host and format',
        status: 'From $350 · Join the list',
        points: [
            { title: 'A named setup', text: 'The exact build, chip, macOS, host and plug-in format.' },
            { title: 'Agreed checks', text: 'Install, validate, load presets, reopen a saved project and render. Validation alone isn’t the test.' },
            { title: 'A private report', text: 'Steps to reproduce each failure. Private unless you agree otherwise.' }
        ],
        form: {
            heading: 'Get first access to release testing',
            intro: 'Leave your email and we’ll reach out when release testing opens.',
            noteLabel: 'Product, host and format (optional)',
            notePlaceholder: 'e.g. AU synth in Logic Pro',
            submit: 'Get first access',
            success: 'You’re on the list. We’ll email you when release testing opens.'
        },
        faq: [
            { question: 'Can I buy a badge?', answer: 'No. You get a test report, and the result is whatever the test shows.' },
            { question: 'Can you cover AU, VST3 and AAX?', answer: 'Each host and format is scoped separately. Start with the one your customers use most.' },
            { question: 'Why not just say Universal Binary?', answer: 'Producers already check that themselves. What they can’t check is whether a saved project reopens with its presets. That’s what the report records.' }
        ]
    },
    'abandoned-app-revival': {
        offer: 'app-revival',
        icon: '🗂️',
        title: 'Abandoned app revival',
        tile: 'Still need an app nobody updates? Tell us.',
        headline: 'Still need an app nobody updates?',
        subhead: 'Tell us the app and what you still use it for. If a permitted way to keep that working looks possible, we’ll email you.',
        price: 'Free interest list',
        status: 'Free · Add your vote',
        points: [
            { title: 'Name the app', text: 'The app, the version and the one thing it lets you do.' },
            { title: 'Tell us what you tried', text: 'Replacements or workarounds, and what still fails.' },
            { title: 'Hear back if there’s a path', text: 'One email if a practical, permitted option turns up.' }
        ],
        form: {
            heading: 'Add your vote',
            intro: 'Joining is free and doesn’t commit you to anything.',
            appLabel: 'App name',
            notePlaceholder: 'e.g. opening old project files',
            noteLabel: 'What do you still use it for? (optional)',
            submit: 'Add my vote',
            success: 'Thanks. We’ll email you if we find a path for this app.'
        },
        faq: [
            { question: 'Will joining bring the app back?', answer: 'Not by itself. We use requests to spot repeated needs and check what’s practical and permitted.' },
            { question: 'Can I send you an installer or license key?', answer: 'Please don’t. Start with the name, version and what you need it for.' },
            { question: 'Should I keep an old Mac for it in the meantime?', answer: 'If it’s the only thing that opens your files, yes. Export what you can to open formats now, whatever happens here.' }
        ]
    }
}

export const servicesIndex = {
    title: 'Services',
    intro: 'Does It ARM tells you what works on Apple Silicon. When you need your exact setup checked, we do that too.',
    offers: [
        {
            icon: '🎚️',
            title: 'Logic upgrade audit',
            text: 'Check your plug-ins and one real session before you move Macs or upgrade macOS.',
            status: '$500 scoped audit · Taking requests',
            href: auditPagePath
        },
        ...Object.entries( servicePages ).map( ( [ slug, page ] ) => ( {
            icon: page.icon,
            title: page.title,
            text: page.tile,
            status: page.status,
            href: `/services/${ slug }/`
        } ) )
    ]
}

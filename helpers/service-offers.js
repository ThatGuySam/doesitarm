// Copy, A/B headline variants and placement rules for Does It ARM services.
// Edit wording here. Variant ids are stored with every impression and click,
// so give a reworded headline a new id instead of reusing an old one.

export const serviceEventsEndpoint = 'https://doesitarm.com/api/subscriptions/service-events'
export const serviceRequestsEndpoint = 'https://doesitarm.com/api/subscriptions/service-requests'

export const auditPagePath = '/services/studio-upgrade-audit/'

// Cloudflare Turnstile widget "Does It ARM services" (doesitarm.com, cf.doesitarm.com, localhost).
// The site key is public. The secret is the subscriptions Worker secret TURNSTILE_SECRET.
// Set this to '' to turn the widget off; the Worker skips the check while its secret is unset.
export const turnstileSiteKey = '0x4AAAAAAGWhwBrgzHSl1Hff'

export const serviceCards = {
    // Music and audio listings that are not native
    'audio': {
        offer: 'studio-upgrade-audit',
        // Stored with every event. Start a new id when the headline set changes.
        experiment: 'audio-headlines-v1',
        subhead: 'We check your plug-ins and sessions and hand you a clear upgrade plan.',
        primary: { label: 'Check my Logic setup', href: auditPagePath },
        secondary: { label: 'Email me when audits open' },
        variants: [
            { id: 'a1', headline: 'Moving your Logic sessions to a new Mac?' },
            { id: 'b1', headline: 'Get your Logic rig Apple Silicon ready.' },
            { id: 'c1', headline: 'Get your plug-ins ready for macOS 28.' },
            { id: 'd1', headline: 'Check your plug-ins before you upgrade.' }
        ]
    },
    // Native music and audio listings, such as Logic Pro
    'audio-native': {
        offer: 'studio-upgrade-audit',
        experiment: 'audio-native-headlines-v1',
        subhead: 'We check what your sessions load and hand you a clear upgrade plan.',
        primary: { label: 'Check my Logic setup', href: auditPagePath },
        secondary: { label: 'Email me when audits open' },
        variants: [
            // {app} becomes the listing name, e.g. "Logic Pro runs natively."
            { id: 'na1', headline: '{app} runs natively. Do your sessions?' },
            { id: 'nb1', headline: 'Make your whole Logic rig Apple Silicon ready.' },
            { id: 'nc1', headline: 'Is every plug-in in your session ready for macOS 28?' }
        ]
    },
    // Native DAWs other than Logic, such as Ableton Live or Pro Tools
    'daw-native': {
        offer: 'studio-upgrade-audit',
        experiment: 'daw-native-v1',
        subhead: 'We check your plug-ins and sessions and hand you a clear upgrade plan.',
        primary: { label: 'Check my setup', href: auditPagePath },
        secondary: { label: 'Email me when audits open' },
        variants: [
            { id: 'dn1', headline: '{app} runs natively. Do your sessions?' }
        ]
    },
    // Discontinued apps on the revival allowlist
    'revival': {
        offer: 'app-revival',
        experiment: 'revival-v1',
        subhead: 'It’s discontinued. Tell us what you still use it for.',
        primary: { label: 'I still need this app' },
        variants: [
            { id: 'r1', headline: 'Still depend on {app}?' }
        ]
    }
}

// Discontinued apps that show the free revival interest card.
// Keep this short and add an app only when it is clearly abandoned.
export const revivalAllowlist = [
    'true-fi'
]

export const audioCategorySlug = 'music-and-audio-tools'

// Logic itself keeps the Logic-specific native card
export const logicAppSlugs = [ 'logic-pro', 'mainstage' ]

// DAWs. Native ones get the DAW-neutral card headlined with the app name.
export const dawAppSlugs = [
    'ableton', 'avid-pro-tools', 'cubase', 'fl-studio', 'studio-one', 'reaper',
    'bitwig-studio', 'garageband', 'reason', 'n-track-studio', 'ardour'
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
    'xln-online-installer', 'slate-digital-connect', 'focusrite-control', 'universal-control', 'splice'
]

// Whole-word matches on a listing's name or aliases
const audioNameTerms = [
    'melodyne', 'celemony', 'native access', 'native instruments', 'kontakt', 'komplete', 'maschine',
    'reaktor', 'omnisphere', 'keyscape', 'spectrasonics', 'serum', 'xfer', 'waves central',
    'izotope', 'ozone', 'ableton', 'pro tools', 'cubase', 'nuendo', 'steinberg', 'fl studio',
    'studio one', 'presonus', 'reaper', 'mainstage', 'garageband', 'logic pro', 'uad',
    'universal audio', 'luna recording', 'arturia', 'spitfire', 'ilok', 'bitwig', 'fabfilter',
    'soundtoys', 'plugin alliance', 'slate digital', 'toontrack', 'superior drummer',
    'addictive drums', 'amplitube', 'auto-tune', 'antares', 'eventide', 'valhalla', 'u-he',
    'output hub', 'eastwest', 'vienna symphonic'
]
const dawNameTerms = [ 'ableton', 'pro tools', 'cubase', 'nuendo', 'fl studio', 'studio one', 'reaper', 'bitwig', 'luna recording' ]

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

    if ( revivalAllowlist.includes( slug ) ) return 'revival'

    if ( !isAudioListing( listing ) ) return null

    if ( listing.status !== 'native' ) return 'audio'
    if ( logicAppSlugs.includes( slug ) ) return 'audio-native'

    return isDawListing( listing ) ? 'daw-native' : 'audio-native'
}

export function fillServiceCopy ( text, { app = '' } = {} ) {
    return text.replaceAll( '{app}', app )
}

// Copy for the audit page
export const auditPage = {
    title: 'Logic upgrade audit',
    headline: 'Will your Logic sessions reopen after the upgrade?',
    subhead: 'We check the plug-ins and sessions you depend on and hand you a clear upgrade plan.',
    price: '$500 scoped audit',
    primary: 'Check my Logic setup',
    secondary: 'Email me when audits open',
    // Set src to an image or video URL to replace the placeholder
    media: {
        type: 'placeholder',
        src: '',
        label: 'Logic session walkthrough coming soon'
    },
    points: [
        {
            title: 'Your plug-ins',
            text: 'Up to 15 plug-in versions, marked native, Rosetta, needs an update or unresolved.'
        },
        {
            title: 'One real session',
            text: 'We reopen a copy and check the inserts, presets and bounce you can’t lose.'
        },
        {
            title: 'A clear plan',
            text: 'What to update, what to print and whether to move now or wait.'
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
            answer: '$500 for one Mac, one target macOS and Logic version, and one session. We confirm scope before you pay.'
        },
        {
            question: 'Do you need my project files?',
            answer: 'Not to start. We work from a copy you choose to share, and you keep your working rig in service.'
        },
        {
            question: 'Can you say if macOS 28 will work?',
            answer: 'Apple keeps general Rosetta support through macOS 27. We show what still depends on it and what to fix first.'
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
            { question: 'How is this different from an Intel inventory?', answer: 'It turns the inventory into decisions: upgrade, update, replace, test first or hold, each with a next step.' }
        ]
    },
    'audio-session-rescue': {
        offer: 'audio-session-rescue',
        icon: '🎛️',
        title: 'Old session rescue',
        tile: 'Get stems out of a project that won’t open.',
        headline: 'Get stems out of a session that won’t open.',
        subhead: 'Start with one project and the last setup that opened it. We test a copy and tell you what can be recovered.',
        price: 'From $500 for one project',
        status: 'From $500 · Join the list',
        points: [
            { title: 'A copy, not your original', text: 'We open a duplicate on an agreed licensed setup and note what loads.' },
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
            { question: 'Do I send my files now?', answer: 'No. Start with the versions and symptoms. If the job fits, we agree on a private way to share files.' }
        ]
    },
    'legacy-studio-hardware': {
        offer: 'legacy-studio-hardware',
        icon: '🔌',
        title: 'Studio interface check',
        tile: 'See if your audio interface makes the move.',
        headline: 'Will your audio interface work with a new Mac?',
        subhead: 'We check your exact interface, adapters and macOS version against the inputs, clock and controls you use.',
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
            { question: 'Can emulation cover a missing driver?', answer: 'Emulation runs many Intel apps, but drivers need their own Arm version. We test each one separately.' }
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
            { title: 'Agreed checks', text: 'Install, validate, load presets, reopen a project and render.' },
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
            { question: 'Can you cover AU, VST3 and AAX?', answer: 'Each host and format is scoped separately. Start with the one your customers use most.' }
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
            { question: 'Can I send you an installer or license key?', answer: 'Please don’t. Start with the name, version and what you need it for.' }
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

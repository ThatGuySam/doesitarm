// Copy, A/B headline variants and placement rules for Does It ARM services.
// Edit wording here. Variant ids are stored with every impression and click,
// so give a reworded headline a new id instead of reusing an old one.

export const serviceEventsEndpoint = 'https://doesitarm.com/api/subscriptions/service-events'
export const serviceRequestsEndpoint = 'https://doesitarm.com/api/subscriptions/service-requests'

export const auditPagePath = '/services/studio-upgrade-audit/'

export const serviceCards = {
    // Music and audio listings that are not native
    'audio': {
        offer: 'studio-upgrade-audit',
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
    // Discontinued apps on the revival allowlist
    'revival': {
        offer: 'app-revival',
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

// Pick at most one card for a listing. Games, formulas and devices get none.
export function getServiceCardType ( listing ) {
    const slug = getListingSlug( listing )
    if ( !slug ) return null

    if ( revivalAllowlist.includes( slug ) ) return 'revival'

    if ( listing?.category?.slug !== audioCategorySlug ) return null

    return listing.status === 'native' ? 'audio-native' : 'audio'
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

export const servicesIndex = {
    title: 'Services',
    intro: 'Hands-on help from the people behind Does It ARM.',
    offers: [
        {
            title: 'Logic upgrade audit',
            text: 'Check your plug-ins and one real session before you move Macs or upgrade macOS.',
            status: '$500 scoped audit · taking requests',
            href: auditPagePath,
            cta: 'See the audit'
        },
        {
            title: 'Revive an abandoned app',
            text: 'Still depend on a discontinued Mac app? Tell us on its page and we’ll gauge interest.',
            status: 'Free interest list',
            href: '/app/true-fi/',
            cta: 'Example: True-Fi'
        }
    ]
}

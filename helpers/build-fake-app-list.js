
import { v4 as uuid } from 'uuid'

// import statuses, { getStatusName } from './statuses'
import { allGenres } from './app-store/genres.js'
import { categories, appCategories } from './categories.js'
import parseDate from './parse-date.js'
// import { eitherMatches } from './matching.js'
import { getAppEndpoint } from './app-derived'
import { makeSlug } from './slug.js'



export const statusMessages = [
    '✅ Yes, Full Native Apple Silicon Support',
    '✳️ Yes, works via Translation or Virtualization',
    '⏹ No, not working at all but support is in development',
    '🚫 No, not yet supported only works on Intel-based Macs',
    '🔶 App has not yet been reported to be native to Apple Silicon',
    '🔶 Unknown, more info needed',
]

function makeAppVariation ( variationOptions ) {
    const [
        // Statuses
        statusMessage,

        // Category Slugs
        categorySlug,

        // Tags
        tagOne,
    ] = variationOptions

    const fakeAppId = uuid()

    const name = `Fake App ${fakeAppId}`
    const slug = makeSlug( name )

    const category = {
        label: 'Developer Tools',
        slug: 'developer-tools'
    }

    return {
        name,
        aliases: [],
        status: '',
        bundleId: '',
        lastUpdated: parseDate( '2021-02-07T03:20:42.086Z' ),
        // url,
        text: statusMessage,
        slug,
        endpoint: getAppEndpoint({
            category: {
                slug: null
            },
            slug: slug
        }),
        category: categories[categorySlug],
        tags: [
            tagOne,
            'fake'
        ],
        // content: token.content,
        relatedLinks: [
            {
                label: 'Website',
                href: 'https://doesitarm.com/apple-silicon-app-test/',
            }
        ],
    }
}

export default async function ( options = {} ) {

    const {
        totalApps = 100
    } = options


    const appOptions = [
        // Statuses
        statusMessages,

        // Category Slugs
        Object.keys( appCategories ),

        // Tags
        [
            '',
            // ...allGenres
        ]
    ]

    let appVariations = appOptions[0].map(function(item) { return [item]; });

    // https://stackoverflow.com/a/35004005/1397641
    for (var k = 1; k < appOptions.length; k++) {
        var next = [];
        appVariations.forEach(function(item) {
            appOptions[k].forEach(function(word) {
                const line = item.slice(0)
                line.push(word)
                next.push(line)
            })
        });
        appVariations = next
    }

    console.log('Total variations', appVariations.length)

    const appList = []


    for ( const variationOptions of appVariations ) {

        const appVariant = makeAppVariation( variationOptions )

        console.log('appVariant', appVariant)

        appList.push( appVariant )

    }


    return appList
}


import { v4 as uuid } from 'uuid'

// import statuses, { getStatusName } from './statuses'
// import appStoreGenres from './app-store/genres.js'
// import { findCategoryForTagsSet } from './categories.js'
import parseDate from './parse-date.js'
// import { eitherMatches } from './matching.js'
import { getAppEndpoint } from './app-derived'
import { makeSlug } from './slug.js'



export default async function ( options = {} ) {

    const {
        totalApps = 100
    } = options

    const appList = []


    for (let i=0; i<totalApps; i++) {

        const fakeAppId = uuid()

        const name = `Fake App ${fakeAppId}`
        const slug = makeSlug( name )

        const category = {
            label: 'Developer Tools',
            slug: 'developer-tools'
        }

        appList.push({
            name,
            aliases: [],
            status: '',
            bundleId: '',
            lastUpdated: parseDate( '2021-02-07T03:20:42.086Z' ),
            // url,
            text: '🔶 App has not yet been reported to be native to Apple Silicon',
            slug,
            endpoint: getAppEndpoint({
                category: {
                    slug: null
                },
                slug: slug
            }),
            category,
            tags: [
                'fake'
            ],
            // content: token.content,
            relatedLinks: [
                {
                    label: 'Website',
                    href: 'https://doesitarm.com/apple-silicon-app-test/',
                }
            ],
        })

    }


    return appList
}

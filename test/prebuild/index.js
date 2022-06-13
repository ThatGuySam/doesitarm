import fs from 'fs-extra'
import test from 'ava'
// import MarkdownIt from 'markdown-it'

import { isValidHttpUrl } from '~/helpers/check-types.js'
import { buildReadmeAppList } from '~/helpers/build-app-list.js'
import {
    matchesWholeWord,
    fuzzyMatchesWholeWord,
    eitherMatches
} from '~/helpers/matching.js'
import {
    PaginatedList
} from '~/helpers/api/pagination.js'


require('dotenv').config()

const allowedTitleCharacters = new Set( 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890 -_.®/\()音乐体验版'.split('') )

// Detect Emojis(Extended Pictograph) in string
// https://stackoverflow.com/a/64007175/1397641
function hasEmoji ( string ) {
    return /\p{Extended_Pictographic}/u.test( string )
}

test.before(async t => {
    const readmeFileContent = await fs.readFile('./README.md', 'utf-8')


    // Store sitemap urls to context
    t.context.readmeFileContent = readmeFileContent
    t.context.readmeAppList = buildReadmeAppList({
        readmeContent: t.context.readmeFileContent,
        scanListMap: new Map(),
        commits: []
    })
})

test('README Apps are formated correctly', (t) => {
    // console.log('t.context.sitemapUrls', t.context.sitemapUrls)

    const {
        readmeAppList
    } = t.context

    // Store found apps so we can check for duplicates
    const foundApps = new Set()

    // Store found invalid apps so we can count and report them
    const invalidApps = new Set()


    for (const readmeApp of readmeAppList) {
        const cleanedAppName = readmeApp.name//.toLowerCase()

        // Check that app has not already been found
        if (foundApps.has(cleanedAppName)) {
            t.fail(`Duplicate app found: ${readmeApp.name}`)
            invalidApps.add(cleanedAppName)
        }
        // Store this app so we can check for future duplicates
        foundApps.add(cleanedAppName)

        // Check that all related links urls are valid
        for (const relatedLink of readmeApp.relatedLinks) {
            if ( !isValidHttpUrl( relatedLink.href ) ) {
                t.log('relatedLink.href', readmeApp.name, relatedLink.href)

                t.fail(`README App ${readmeApp.name} does not have valid url`, readmeApp.url)
                invalidApps.add(cleanedAppName)
            }
        }


        // Check that status text is free of markdown
        if ( readmeApp.text.includes('](') ) {
            t.fail(`README App ${readmeApp.name} markdown in status text`)
            invalidApps.add(cleanedAppName)
        }

        // Check that status has an emoji
        if ( hasEmoji( readmeApp.text ) === false ) {
            t.fail(`README App ${readmeApp.name} does not have emoji`)
            invalidApps.add(cleanedAppName)
        }

        // Check for not allowed characters in app name
        for ( const character of cleanedAppName ) {
            if ( !allowedTitleCharacters.has( character ) ) {

                // badCharacter = readmeApp.name[firstBadCharacterIndex]

                // t.log( readmeApp )
                t.fail(`README App Title ${readmeApp.name} has non-alphanumeric character ${character}(charCode ${character.charCodeAt(0)})`)
                invalidApps.add(cleanedAppName)
            }
        }

    }

    t.log( readmeAppList.length - invalidApps.size, 'valid apps found' )
    t.log( readmeAppList.length, 'apps found in README' )

    t.pass()
})


function sortAppsAlphabetically ( a, b ) {
    return a.name.localeCompare(b.name)
}


test('README Apps are in alphbetical order', (t) => {

    const {
        readmeAppList
    } = t.context

    const appsByCategory = new Map()



    // Group apps by category
    for ( const readmeApp of readmeAppList ) {
        const category = readmeApp.category.slug

        if ( !appsByCategory.has(category) ) {
            appsByCategory.set(category, [])
        }

        appsByCategory.get( category ).push(readmeApp)
    }

    // Sort apps in groups alphabetically
    for ( const [ category, apps ] of appsByCategory ) {

        const unsortedApps = apps.slice()

        // Sort apps in category in place
        apps.sort(sortAppsAlphabetically)

        // Check sorted sorted apps against unsorted apps
        for ( const [ index, unsortedApp ] of unsortedApps.entries() ) {
            const sortedApp = apps[index]

            if ( sortedApp.slug !== unsortedApp.slug ) {
                t.fail(`README App at index ${index} of ${category} is ${unsortedApp.name} but should be ${sortedApp.name}`)
            }
        }
    }

    t.pass()
})



const namesWithPlusses = [
    'Xournal++',
    'Notepad++'
]

test('Can match names with pluses', (t) => {



    // Sort apps in groups alphabetically
    for ( const nameWithPluses of namesWithPlusses ) {

        const haystack = `FDKLS:KF ${nameWithPluses}NDFLSKFLSJDK`

        t.assert( matchesWholeWord( nameWithPluses, haystack ) )

        t.assert( fuzzyMatchesWholeWord( nameWithPluses, haystack ) )

        t.assert( eitherMatches( nameWithPluses, haystack ) )
        t.assert( eitherMatches( haystack, nameWithPluses ) )
    }

    t.pass()
})


test('Can paginate', async (t) => {
    const cases = [
        {
            from: {
                list: [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ],
                perPage: 2
            },
            expect: {
                pageCount: 5,
                pages: [
                    {
                        number: 1,
                        hasNextPage: true,
                        hasPreviousPage: false,
                        items: [1, 2],
                        json: '[1,2]'
                    },
                    {
                        number: 2,
                        hasNextPage: true,
                        hasPreviousPage: true,
                        items: [3, 4],
                        json: '[3,4]'
                    },

                    // Last page should have less than perPage items
                    {
                        number: 5,
                        hasNextPage: false,
                        hasPreviousPage: true,
                        items: [9],
                        json: '[9]'
                    }
                ]
            }
        }
    ]

    for ( const { from, expect } of cases ) {

        const paginatedList = new PaginatedList( from )

        // Assert that page count is correct
        t.is( paginatedList.pageCount, expect.pageCount, 'pageCount is incorrect' )

        // Assert that the pages we're expecting are there
        for ( const expectedPage of expect.pages ) {
            // Get respective output page
            const outputPage = paginatedList.pages[ expectedPage.number - 1 ]

            t.deepEqual( outputPage, expectedPage, `Page ${ expectedPage.number } is an unexpected structure` )
        }
    }

} )

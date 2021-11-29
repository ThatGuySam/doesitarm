import fs from 'fs-extra'
import test from 'ava'
// import MarkdownIt from 'markdown-it'

import { buildReadmeAppList } from '../helpers/build-app-list.js'


require('dotenv').config()

// const md = new MarkdownIt()

const allowedTitleCharacters = new Set( 'ABCDEFGHIJKMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890 -.'.split('') )


function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}


test.before(async t => {
    const readmeFileContent = await fs.readFile('./README.md', 'utf-8')
    // const readmeMarkdown = md.parse( readmeFileContent )

    // t.log( 'readmeMarkdown', readmeMarkdown )


    // Store sitemap urls to context
    t.context.readmeFileContent = readmeFileContent
})

test('README App Titles are alphanumeric only', (t) => {
    // console.log('t.context.sitemapUrls', t.context.sitemapUrls)

    const readmeAppList = buildReadmeAppList({
        readmeContent: t.context.readmeFileContent,
        scanListMap: new Map(),
        commits: []
    })


    // console.log('readmeAppList', readmeAppList)
    t.log('readmeAppList', readmeAppList.length)


    for (const readmeApp of readmeAppList) {
        const cleanedAppName = readmeApp.name//.toLowerCase()

        // const firstInvisbleCharacterIndex = cleanedAppName.search( invisibleCharacerRegex )

        // const standardSpaceCharCode = 32

        for ( const character of cleanedAppName ) {
            if ( !allowedTitleCharacters.has( character ) ) {

                // badCharacter = readmeApp.name[firstBadCharacterIndex]

                // t.log( readmeApp )
                t.fail(`README App Title ${readmeApp.name} has non-alphanumeric character ${character}(charCode ${character.charCodeAt(0)})`)

                break
            }
        }

        // if ( readmeApp.name.includes('Apple Trans') ) {
        //     const normalNameLength = 'Apple Transporter'.length
        //     t.log( 'normalNameLength', normalNameLength )
        //     t.log( readmeApp.name, readmeApp.name.length )
        // }
    }

    // const urlsWithDoubleSlashes = t.context.sitemapUrls.filter( url => url.pathname.includes('//') )

    // if ( urlsWithDoubleSlashes.length > 0) {
    //     t.fail( `${ urlsWithDoubleSlashes.length } urls with doubles slashes found including ${ urlsWithDoubleSlashes[0] }` )
    // }

    t.log( `${readmeAppList.length} valid alpanumeric app titles in readme` )
    t.pass()
})

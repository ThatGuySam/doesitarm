// Check which scanned apps a README app name would absorb, using the real build.
// Usage: bun scripts/check-name-collisions.mjs "Yandex Browser=https://browser.yandex.com" "Notion Calendar"
// Pass the README link after `=` when you have it: the vendor checks use its host.
// Without one the entry is checked as if its link named no vendor.
// Runs with bun because the build helpers use the `~/` import alias.
// See docs/app-name-collisions.md for the rules.

import fs from 'node:fs'

import { buildReadmeAppList, buildScanListMap } from '../helpers/build-app-list.js'
import { eitherMatches } from '../helpers/matching.js'

const entries = process.argv.slice( 2 ).map( argument => {
    const separator = argument.indexOf( '=http' )

    return separator === -1
        // No link: like an App Store or GitHub link, it gives no vendor evidence
        ? { name: argument, url: '' }
        : { name: argument.slice( 0, separator ), url: argument.slice( separator + 1 ) }
} )

if ( entries.length === 0 ) {
    console.error( 'Pass one or more README app names to check, optionally as "Name=https://link".' )
    process.exit( 1 )
}

const scansUrl = process.env.SCANS_SOURCE || 'https://doesitarm-functions-scc.vercel.app/app-test-reports.json'
const feed = await fetch( scansUrl ).then( response => response.json() )
const readme = fs.readFileSync( new URL( '../README.md', import.meta.url ), 'utf8' )

function getOwners ( readmeContent ) {
    const scanListMap = buildScanListMap( feed.appList )
    const listings = buildReadmeAppList( { readmeContent, scanListMap, commits: [] } )
    const owners = new Map()

    for ( const listing of listings ) {
        for ( const bundleId of listing.bundleIds ) owners.set( bundleId, listing.name )
    }

    // Scans left in the map keep their own listing
    for ( const scan of scanListMap.values() ) owners.set( scan.bundleIds[ 0 ], null )

    return owners
}

const baseline = getOwners( readme )

// Add the names that are not in the README yet, at the end of the list
const readmeNames = new Set( [ ...readme.matchAll( /^\* \[(.+?)\]\(/gm ) ].map( match => match[ 1 ] ) )
const newEntries = entries.filter( entry => !readmeNames.has( entry.name ) )
const candidateLines = newEntries.map( entry => `* [${ entry.name }](${ entry.url }) - 🔶 Name check` ).join( '\n\n' )
const candidateReadme = newEntries.length === 0
    ? readme
    : readme.replace( /^<!-+ *end-of-list *-+>/m, marker => `#### Name check\n\n${ candidateLines }\n\n${ marker }` )
if ( candidateReadme === readme && newEntries.length > 0 ) throw new Error( 'Could not find the end-of-list marker in README.md' )

const candidate = getOwners( candidateReadme )

const scansByBundleId = new Map( feed.appList.map( scan => [ scan.bundleIdentifier, scan ] ) )
let hasCollision = false

for ( const { name } of entries ) {
    const absorbed = [ ...candidate ].filter( ( [ , owner ] ) => owner === name ).map( ( [ bundleId ] ) => bundleId )
    const status = readmeNames.has( name ) ? 'already in README.md' : 'new entry'

    console.log( `\n${ name } (${ status }): absorbs ${ absorbed.length } scan(s)` )

    for ( const bundleId of absorbed ) {
        const scan = scansByBundleId.get( bundleId )
        const before = baseline.get( bundleId )
        const from = before === name ? '' : before ? `  TAKEN FROM README entry "${ before }"` : '  its own listing goes away'

        if ( before !== name ) hasCollision = true
        console.log( `  ${ scan?.aliases?.[ 0 ] }  ${ bundleId }${ from }` )
    }

    const keptApart = feed.appList.filter( scan => !absorbed.includes( scan.bundleIdentifier ) &&
        scan.aliases.some( alias => typeof alias === 'string' && eitherMatches( alias, name ) ) )

    if ( keptApart.length > 0 ) {
        console.log( '  Name matches kept apart (vendor checks, a better entry, or SEPARATE_PRODUCTS):' )

        for ( const scan of keptApart ) {
            const owner = candidate.get( scan.bundleIdentifier )
            console.log( `    ${ scan.aliases[ 0 ] }  ${ scan.bundleIdentifier }  -> ${ owner ? `README entry "${ owner }"` : owner === null ? 'own listing' : 'not listed (slug taken by another scan)' }` )
        }
    }

    if ( absorbed.length > 1 ) hasCollision = true
}

if ( hasCollision ) {
    console.log( '\nThe entry absorbs several scans or takes one from another listing. Confirm they are all the same product, or rename the entry.' )
    process.exit( 2 )
}

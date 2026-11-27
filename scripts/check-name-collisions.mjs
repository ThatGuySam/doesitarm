// Check which live listings a README app name would match.
// Usage: node scripts/check-name-collisions.mjs "Yandex" "Yandex Browser"
// See docs/app-name-collisions.md for the rules.

import { eitherMatches } from '../helpers/matching.js'

const names = process.argv.slice( 2 )

if ( names.length === 0 ) {
    console.error( 'Pass one or more README app names to check.' )
    process.exit( 1 )
}

const listUrl = process.env.APP_LIST_URL || 'https://api.doesitarm.com/app-list.json'
const appList = await fetch( listUrl ).then( response => response.json() )

let hasCollision = false

for ( const name of names ) {
    const matches = appList.flatMap( app => {
        const aliases = [ app.name, ...( app.aliases || [] ) ].filter( alias => alias.trim().length > 0 )
        const matchedAlias = aliases.find( alias => eitherMatches( alias, name ) )

        return matchedAlias ? [ { ...app, matchedAlias } ] : []
    } )

    console.log( `\n${ name }: matches ${ matches.length } listing(s)` )

    for ( const app of matches ) {
        console.log( `  ${ app.name }  [${ app.status }]  ${ app.endpoint }  via alias "${ app.matchedAlias }"  ${ ( app.bundleIds || [] ).slice( 0, 3 ).join( ', ' ) }` )
    }

    if ( matches.length > 1 ) hasCollision = true
}

if ( hasCollision ) {
    console.log( '\nMore than one listing matched. Confirm they are all the same product, or rename the entry.' )
    process.exit( 2 )
}

import execa from 'execa'
import fs from 'fs-extra'
import has from 'just-has'
import TOML from '@iarna/toml'
import * as matter from 'gray-matter'


import {
    isNonEmptyString,
    isNonEmptyArray
} from '~/helpers/check-types.js'
import {
    storkTomlPath,
} from '~/helpers/stork/config.js'
import { downloadStorkExecutable } from '~/helpers/stork/executable.js'




function makeDetailsFromListing ( listing ) {

    const propertiesToCheck = {
        text: isNonEmptyString,
        content: isNonEmptyString,
        description: isNonEmptyString,
        // status: isNonEmptyString,
        aliases: isNonEmptyArray,
        tags: isNonEmptyArray,
    }

    const contents = {}

    for ( const [ property, isValid ] of Object.entries( propertiesToCheck ) ) {
        if ( !has( listing, property ) ) continue

        if ( !isValid( listing[ property ] ) ) continue

        let value = listing[ property ]

        // Convert arrays to string
        if ( Array.isArray( value ) ) {
            value = value.join(', ')
        }

        // Property can be added to content
        contents[ property ] = value
    }


    return [
        listing.content || 'No content',
        has( listing, 'status' ) ? `status:${ listing.status }` : '',
        // Brownmatter
        matter.stringify( '', contents ),
    ].join('')
}


function mapSitemapEndpointsToToml ( sitemap ) {

    return {
        input: {
            // https://stork-search.net/docs/config-ref#base_directory
            base_directory: '.',
            url_prefix: 'https://doesitarm.com',

            // https://stork-search.net/docs/config-ref#files
            files: sitemap.map( sitemapEntry => {
                const {
                    payload,
                    route
                } = sitemapEntry

                // console.log( 'payload', route, payload )

                const listing = payload.app || payload.listing || payload.video || {}

                const contents = makeDetailsFromListing( listing )

                const title = listing.name || route

                // console.log( 'listing', listing )
                // console.log( 'contents', contents )
                // console.log( 'name', listing.name )

                if ( contents.trim().length === 0 ) {
                    console.log( 'listing', listing )
                    throw new Error('Empty Content')
                }

                return {
                    // https://stork-search.net/docs/config-ref#title
                    title,
                    url: route,
                    contents
                }
            })
        }
    }
}


export async function writeStorkToml ( sitemap ) {



    const indexToml = mapSitemapEndpointsToToml( sitemap )

    // Build Stork Index TOML
    // https://stork-search.net/docs/config-ref
    const indexString = TOML.stringify( indexToml )

    // Save to file
    await fs.outputFile( storkTomlPath, indexString )

    return
}

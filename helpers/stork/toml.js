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
    getRouteType
} from '~/helpers/app-derived.js'
import {
    storkTomlPath,
} from '~/helpers/stork/config.js'
import { downloadStorkExecutable } from '~/helpers/stork/executable.js'




function makeDetailsFromListing ({ listing, route }) {

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
        listing.content || '∅', // Null Symbol
        has( listing, 'status' ) ? `status_${ listing.status }` : '',
        `type_${ getRouteType( route ) }`,
        // Brownmatter
        matter.stringify( '', contents ),
    ].join('\r\n')
}


function mapSitemapEndpointsToToml ( sitemap ) {

    const files = sitemap.map( sitemapEntry => {
        const {
            payload,
            route
        } = sitemapEntry

        const routeType = getRouteType( route )

        // console.log( 'payload', route, payload )

        const listing = payload.app || payload.listing || payload.video || {}

        const contents = makeDetailsFromListing({ listing, route })

        let title = listing.name || route

        // If this route is a benchmark route, add the benchmark name
        if ( routeType === 'benchmarks' ) {
            title = `${ title } Benchmarks`
        }

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

    return {
        input: {
            // https://stork-search.net/docs/config-ref#base_directory
            base_directory: '.',
            url_prefix: 'https://doesitarm.com',

            // https://stork-search.net/docs/config-ref#files
            files
        },
        output: {
            // debug: true,
            // save_nearest_html_id: false,
            // excerpt_buffer: 8,
            // excerpts_per_result: 5,
            displayed_results_count: 100,
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

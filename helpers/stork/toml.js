import execa from 'execa'
import fs from 'fs-extra'
import has from 'just-has'
import TOML from '@iarna/toml'


import { isDarwin } from '~/helpers/environment.js'
import {
    isNonEmptyString,
    isNonEmptyArray
} from '~/helpers/check-types.js'
import {
    storkVersion,
    storkExecutableName,
    storkExecutablePath,
    storkTomlPath,
} from '~/helpers/stork/config.js'


// https://stork-search.net/docs/install
const execDownloadUrls = {
    darwin: `https://files.stork-search.net/releases/v${ storkVersion }/stork-macos-10-15`,
    default: `https://files.stork-search.net/releases/v${ storkVersion }/stork-amazon-linux`
}

export async function downloadStorkExecutable () {
    const envKey = isDarwin() ? 'darwin' : 'default'

    const execDownloadUrl = execDownloadUrls[ envKey ]

    // console.log( 'execDownloadUrl', execDownloadUrl )

    // Delete any existing executable
    // so we don't get write errors
    // or false positives from preexisting executable files
    await fs.remove( storkExecutablePath )

    // Download the binary
    await execa( `curl`, [
        execDownloadUrl,

        // Set filename
        '-o',
        storkExecutableName
    ])


    // Set the downloaded binary as executable
    await fs.chmod( storkExecutablePath, '755' )
    // Check that our downloaded binary is executable
    // https://stackoverflow.com/a/69897809/1397641
    const stats = await fs.stat( storkExecutablePath )
    const isExecutable = !!(stats.mode & fs.constants.S_IXUSR)

    // console.log( 'isExecutable', isExecutable )
    if ( !isExecutable ) throw new Error( 'Downloaded binary is not executable.' )


    // Check Stork version
    // so we know our binary is working
    const { stdout } = await execa( storkExecutablePath, [
        '--version'
    ])

    console.log( 'Stork Version', stdout )
    if ( !stdout.includes( storkVersion ) ) throw new Error( 'Stork --version command failed.' )

    return stdout
}

function makeIndexContentsFromListing ( listing ) {

    const propertiesToCheck = {
        text: isNonEmptyString,
        content: isNonEmptyString,
        description: isNonEmptyString,
        // status: isNonEmptyString,
        aliases: isNonEmptyArray,
        tags: isNonEmptyArray,
    }

    const contents = []

    for ( const [ property, isValid ] of Object.entries( propertiesToCheck ) ) {
        if ( !has( listing, property ) ) continue

        if ( !isValid( listing[ property ] ) ) continue

        let value = listing[ property ]

        // Convert arrays to string
        if ( Array.isArray( value ) ) {
            value = value.join(', ')
        }

        // Property can be added to content

        contents.push( value )
    }

    let contentString = contents.join('\n')

    if ( contentString.trim().length === 0 ) return 'No content'

    return contentString
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

                const listing = payload.app || payload.listing || {}

                const contents = makeIndexContentsFromListing( listing )

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

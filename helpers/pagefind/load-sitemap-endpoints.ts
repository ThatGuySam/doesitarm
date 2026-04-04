import fs from 'fs-extra'
import axios from 'axios'

import {
    sitemapEndpointsPath
} from '~/helpers/pagefind/config.js'

function shouldRetryError ( error: unknown ) {
    const status = ( error as { response?: { status?: number } } )?.response?.status

    return typeof status === 'number' && status >= 500
}

async function fetchJsonWithRetries (
    url: string,
    {
        attempts = 3,
        delayMs = 1000
    }: {
        attempts?: number
        delayMs?: number
    } = {}
) {
    let lastError: unknown

    for ( let attempt = 1; attempt <= attempts; attempt += 1 ) {
        try {
            const response = await axios.get( url )

            return response.data
        } catch ( error ) {
            lastError = error

            if ( attempt >= attempts || !shouldRetryError( error ) ) {
                throw error
            }

            await new Promise( resolve => setTimeout( resolve, delayMs ) )
        }
    }

    throw lastError
}

export async function loadSitemapEndpoints () {
    if ( await fs.pathExists( sitemapEndpointsPath ) ) {
        return await fs.readJson( sitemapEndpointsPath )
    }

    if ( !process.env.PUBLIC_API_DOMAIN ) {
        throw new Error(`Missing ${ sitemapEndpointsPath } and PUBLIC_API_DOMAIN is not set`)
    }

    const apiUrl = new URL( process.env.PUBLIC_API_DOMAIN )
    apiUrl.pathname = sitemapEndpointsPath.replace(/^\.?\/?static\//, '/')

    return await fetchJsonWithRetries( apiUrl.toString() )
}

export {
    fetchJsonWithRetries,
    shouldRetryError
}

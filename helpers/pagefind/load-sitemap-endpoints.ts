import fs from 'fs-extra'
import {
    getJson,
    shouldRetryError
} from '~/helpers/http.js'

import {
    sitemapEndpointsPath
} from '~/helpers/pagefind/config.js'

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
    return await getJson( url, {
        attempts,
        delayMs
    } )
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

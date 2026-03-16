import fs from 'fs-extra'
import axios from 'axios'
import 'dotenv/config.js'

import {
    sitemapEndpointsPath
} from '~/helpers/pagefind/config.js'
import {
    writePagefindIndex
} from '~/helpers/pagefind/index.js'

async function loadSitemapEndpoints () {
    if ( await fs.pathExists( sitemapEndpointsPath ) ) {
        return await fs.readJson( sitemapEndpointsPath )
    }

    if ( !process.env.PUBLIC_API_DOMAIN ) {
        throw new Error(`Missing ${ sitemapEndpointsPath } and PUBLIC_API_DOMAIN is not set`)
    }

    const apiUrl = new URL( process.env.PUBLIC_API_DOMAIN )
    apiUrl.pathname = sitemapEndpointsPath.replace(/^\.?\/?static\//, '/')

    const response = await axios.get( apiUrl.toString() )

    return response.data
}

;(async () => {
    const sitemapEndpoints = await loadSitemapEndpoints()
    const {
        outputPath,
        recordCount
    } = await writePagefindIndex( sitemapEndpoints )

    console.log(`Built Pagefind index with ${ recordCount } records at ${ outputPath }`)

    process.exit()
})().catch( error => {
    console.error( error )
    process.exit(1)
})

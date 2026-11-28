import 'dotenv/config.js'

import {
    loadSitemapEndpoints
} from '~/helpers/pagefind/load-sitemap-endpoints'
import {
    writePagefindIndex
} from '~/helpers/pagefind/index.js'

import { pluginPagefindEntries } from '~/helpers/plugins/discovery.mjs'

;(async () => {
    const plugins = pluginPagefindEntries()
    const pluginRoutes = new Set( plugins.map( entry => entry.route.replace( /\/$/, '' ) ) )
    const baseEndpoints = await loadSitemapEndpoints()
    const sitemapEndpoints = [
        ...baseEndpoints.filter( entry => !pluginRoutes.has( entry.route.replace( /\/$/, '' ) ) ),
        ...plugins
    ]
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

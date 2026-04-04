import 'dotenv/config.js'

import {
    loadSitemapEndpoints
} from '~/helpers/pagefind/load-sitemap-endpoints'
import {
    writePagefindIndex
} from '~/helpers/pagefind/index.js'

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

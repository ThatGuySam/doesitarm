import fs from 'fs-extra'

import {
    downloadStorkExecutable,
    // writeStorkToml
} from './helpers/stork/toml.js'

;(async () => {

    console.log( 'Downloading Stork executable...' )
    await downloadStorkExecutable()

    // console.log( 'Building Stork index TOML...' )

    // Get Sitemap Endpoints JSON
    // const sitemap = await fs.readJson( './static/sitemap-endpoints.json' )

    // await writeStorkToml( sitemap )

    // From here we hand off to the Stork executable

    process.exit()
})()

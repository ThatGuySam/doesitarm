import { execSync } from 'child_process'
import 'dotenv/config.js'

import {
    getSearchProvider
} from '~/helpers/search/config.js'

const searchProvider = getSearchProvider( process.env.PUBLIC_SEARCH_PROVIDER )

console.log(`Building search index for provider: ${ searchProvider }`)

if ( searchProvider === 'stork' ) {
    execSync( 'pnpm stork-index', { stdio: 'inherit' } )
    process.exit()
}

execSync( 'pnpm build-pagefind-index', { stdio: 'inherit' } )
process.exit()

import { isMacOS } from 'std-env'

import { getText } from '~/helpers/http.js'

;(async () => {

    if ( !isMacOS ) {
        console.log('Not on macOS, skipping')

        process.exit()
    }

    const data = await getText( 'https://master--doesitarm.netlify.app/apple-silicon-app-test' )

    console.log( data.slice(0, 100) )

    process.exit()
})()

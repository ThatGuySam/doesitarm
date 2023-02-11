import { isMacOS } from 'std-env'

import axios from 'axios'

;(async () => {

    if ( !isMacOS ) {
        console.log('Not on macOS, skipping')

        process.exit()
    }

    const { data } = await axios.get(`https://master--doesitarm.netlify.app/apple-silicon-app-test`)

    console.log( data.slice(0, 100) )

    process.exit()
})()

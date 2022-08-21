import { createServer } from 'vite'
import axios from 'axios'

import viteConfig from '~/vite.config.mjs'

;(async () => {
    // await scanNewAppsAsBrowser()
    // http://localhost:3000/
    const server = await createServer({
        ...viteConfig,
    })

    await server.listen();

    console.log('Server listening on http://localhost:3000/')

    const { data } = await axios.get('http://localhost:3000/')

    console.log( data.slice(0, 100) )

    await server.close();

    process.exit()
})()

import { createServer } from 'vite'
import axios from 'axios'

import viteConfig from '~/vite.config.mjs'

const port = 1337

;(async () => {
    // await scanNewAppsAsBrowser()
    // http://localhost:3000/
    const server = await createServer({
        ...viteConfig,
        port
    })

    console.log( 'server', server )

    await server.listen();

    console.log(`Server listening on http://localhost:${ port }/`)

    const { data } = await axios.get(`http://localhost:${ port }/`)

    console.log( data.slice(0, 100) )

    await server.close();

    process.exit()
})()

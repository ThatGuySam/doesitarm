import { createServer } from 'vite'
import axios from 'axios'

import viteConfig from '~/vite.config.mjs'
import { isLinux } from '~/helpers/environment.js'

const port = 1337

// Example: doesitarm-cif09horl-samcarltoncreative.vercel.app
const vercelUrl = process.env.VERCEL_URL

;(async () => {

    // Disable on linux (server environments)
    if ( isLinux() ) return

    // await scanNewAppsAsBrowser()
    // http://localhost:3000/
    const server = await createServer({
        ...viteConfig,
        port
    })

    console.log( 'server', server )

    await server.listen();

    console.log(`Server listening on https://${ vercelUrl }:${ port }/`)

    const { data } = await axios.get(`http://${ vercelUrl }:${ port }/`)

    console.log( data.slice(0, 100) )

    await server.close();

    process.exit()
})()

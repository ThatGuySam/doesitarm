import tailwind from '@astrojs/tailwind'
import vue from '@astrojs/vue'

import viteConfig from './vite.config.mjs'

export function makeSharedAstroConfig () {
    return {
        output: 'server',
        publicDir: './static',
        site: 'https://doesitarm.com/',
        integrations: [
            vue(),
            tailwind()
        ],
        vite: viteConfig
    }
}

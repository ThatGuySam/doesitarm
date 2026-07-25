import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'

import { makeSharedAstroConfig } from './astro.config.shared.mjs'

export default defineConfig({
    ...makeSharedAstroConfig(),
    adapter: cloudflare({
        imageService: 'passthrough'
    })
})

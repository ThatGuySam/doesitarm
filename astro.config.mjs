import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwind from '@astrojs/tailwind'
// Astro Cloudflare Reference
// https://docs.astro.build/en/guides/integrations-guide/cloudflare/
import cloudflare from '@astrojs/cloudflare'
// import sitemap from '@astrojs/sitemap'
import partytown from '@astrojs/partytown'

import tsconfigPaths from 'vite-tsconfig-paths'
// import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

import { makeViteDefinitions } from './helpers/public-runtime-config.mjs'

import viteConfig from './vite.config.mjs'

console.log( 'Running Astro Config File' )

// https://astro.build/config
export default defineConfig({
    output: 'server',
    publicDir: './static',
    site: 'https://doesitarm.com/',
    // SSR on Cloudflare Workers (cf.doesitarm.com preview for the Netlify→CF
    // migration). The dynamic /app /game /device /formula /kind /tv routes are
    // request-time rendered (read Astro.request, fetch the DoesItAPI), so SSR —
    // not a static export — is the right fit. imageService: passthrough avoids
    // requiring a Cloudflare Images (IMAGES) binding for the preview.
    adapter: cloudflare({ imageService: 'passthrough' }),
    integrations: [
        // Astro Vue Reference
        // https://github.com/withastro/astro/tree/main/packages/integrations/vue
        vue(),
        tailwind(),
        // Sitemap Reference
        // https://github.com/withastro/astro/blob/main/packages/integrations/sitemap/src/index.ts
        // https://github.com/withastro/astro/tree/main/packages/integrations/sitemap#configuration
        // sitemap({
        //     customPages: [
        //         '/relative-url',
        //         'https://doesitarm.com/absolute-url',
        //     ]
        // })
        partytown({
            // Add dataLayer.push as a forwarding-event.
            // https://github.com/withastro/astro/tree/main/packages/integrations/partytown#configforward
            config: { forward: [ 'dataLayer.push' ] },
        }),
    ],
    // Vite options
    // https://docs.astro.build/en/reference/configuration-reference/#vite
    vite: viteConfig
})

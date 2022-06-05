import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwind from '@astrojs/tailwind'
// Astro Netlify Reference
// https://github.com/withastro/astro/tree/main/packages/integrations/netlify
import netlify from '@astrojs/netlify/functions'
import sitemap from '@astrojs/sitemap'

// import { viteCommonjs } from '@originjs/vite-plugin-commonjs'

import { makeViteDefinitions } from './helpers/public-runtime-config.mjs'

console.log( 'Running Astro Config File' )

// https://astro.build/config
export default defineConfig({
    publicDir: './static',
    site: 'https://doesitarm.com',
    integrations: [
        netlify({
            dist: new URL('./dist/', import.meta.url)
        }),
        // Astro Vue Reference
        // https://github.com/withastro/astro/blob/main/packages/integrations/sitemap/src/index.ts
        // https://github.com/withastro/astro/tree/main/packages/integrations/vue
        vue(),
        tailwind(),
        // Sitemap Reference
        // https://github.com/withastro/astro/tree/main/packages/integrations/sitemap#configuration
        sitemap()
    ],
    // Vite options
    // https://docs.astro.build/en/reference/configuration-reference/#vite
    vite: {
        // Vite: https://vitejs.dev/config/#define
        // esbuild: https://esbuild.github.io/api/#define
        define: {
            ...makeViteDefinitions()
        },
        // plugins: [
        //     viteCommonjs()
        // ],
        build: {
            commonjsOptions: {
                transformMixedEsModules: true
            }
        }
    }
})

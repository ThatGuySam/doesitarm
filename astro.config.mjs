import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwind from '@astrojs/tailwind'
import netlify from '@astrojs/netlify/functions'


// https://astro.build/config
export default defineConfig({
    publicDir: './static',
    site: 'https://doesitarm.com',

    integrations: [
        netlify({
            dist: new URL('./dist/', import.meta.url)
        }),
        vue(),
        tailwind()
    ]
});

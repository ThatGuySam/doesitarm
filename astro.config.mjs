import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwind from '@astrojs/tailwind'

// https://astro.build/config
export default defineConfig({
    srcDir: './src-astro',
    publicDir: './static',
    site: 'https://doesitarm.com',

    integrations: [
        vue(),
        tailwind()
    ]
});

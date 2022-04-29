import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwind from '@astrojs/tailwind'
// Astro Netlify Reference
// https://github.com/withastro/astro/tree/main/packages/integrations/netlify
import netlify from '@astrojs/netlify/functions'


// https://astro.build/config
export default defineConfig({
    publicDir: './static',
    site: 'https://doesitarm.com',

    integrations: [
        netlify({
            dist: new URL('./dist/', import.meta.url)
        }),
        // Astro Vue Reference
        // https://github.com/withastro/astro/tree/main/packages/integrations/vue
        vue(),
        tailwind()
    ]
});

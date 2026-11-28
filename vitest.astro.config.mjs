// Renders .astro components in tests with Astro's container API.
import { getViteConfig } from 'astro/config'

export default getViteConfig({
    test: {
        include: [ 'test/astro/**/*.test.js' ],
        env: { URL: 'https://doesitarm.com', PUBLIC_URL: 'https://doesitarm.com' },
    },
})

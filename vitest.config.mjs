import { configDefaults, defineConfig } from 'vitest/config'

import astroConfig from './astro.config.mjs'


const vitestConfig = {

    ...astroConfig,

    // Requires merging in astroConfig.vite
    ...astroConfig.vite,

    test: {
        // testTimeout: 60 * 1000,
        setupFiles: 'tsconfig-paths/register',
        exclude: [
            ...configDefaults.exclude,
            'test/_disabled/**',
            // Needs the Astro compiler; run with vitest.astro.config.mjs
            'test/astro/**',
            // Has its own package.json, deps and vitest config
            'workers/mcp/**'
        ]
    }
}

// console.log( 'vitestConfig', vitestConfig )

export default defineConfig( vitestConfig )

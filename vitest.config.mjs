import { defineConfig } from 'vitest/config'

import astroConfig from './astro.config.mjs'


const vitestConfig = {

    ...astroConfig,

    // Requires merging in astroConfig.vite
    ...astroConfig.vite,

    test: {
        // testTimeout: 60 * 1000,
        setupFiles: 'tsconfig-paths/register'
    }
}

// console.log( 'vitestConfig', vitestConfig )

export default defineConfig( vitestConfig )

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
            'test/_disabled/**'
        ]
    }
}

// console.log( 'vitestConfig', vitestConfig )

export default defineConfig( vitestConfig )

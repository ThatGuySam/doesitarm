import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import astroConfig from './astro.config.mjs'

const vitestConfig = {
    ...astroConfig,
    ...astroConfig.vite,
    resolve: {
        alias: {
            '~': fileURLToPath(new URL('./', import.meta.url)),
        },
    },
    test: {
        setupFiles: 'tsconfig-paths/register',
        // Add environment setup for tests
        environment: 'node',
    }
}

// console.log( 'vitestConfig', vitestConfig )

export default defineConfig(vitestConfig)

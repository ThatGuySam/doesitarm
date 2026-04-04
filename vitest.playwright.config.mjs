import { defineConfig } from 'vitest/config'

import astroConfig from './astro.config.mjs'


const vitestConfig = {
    ...astroConfig,
    ...astroConfig.vite,
    test: {
        setupFiles: 'tsconfig-paths/register',
        include: [
            'test/playwright/**/*.playwright.js',
            'test/playwright/**/*.playwright.ts'
        ],
        exclude: [
            'test/_disabled/**'
        ],
        fileParallelism: false,
        hookTimeout: 120 * 1000,
        testTimeout: 120 * 1000
    }
}

export default defineConfig( vitestConfig )

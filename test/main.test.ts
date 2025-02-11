/**
 * Main test suite for sitemap validation and structured data testing
 * Ensures sitemap URLs are properly formatted and match production
 * 
 * @example
 * $ na vitest test/main.test.ts
 */
import { describe, test, beforeAll, expect } from 'vitest'
import fs from 'fs-extra'
import { URL } from 'url'
import { 
    sitemapIndexFileName 
} from '~/helpers/constants'
import {
    getAllUrlsFromLocalSitemap,
    fetchAllUrlsFromSitemaps
} from '~/helpers/api/sitemap/parse'

interface TestContext {
    sitemapUrls: URL[]
}

const context: TestContext = {
    sitemapUrls: []
}

const sitemapFilesToTry = [
    sitemapIndexFileName,
    'sitemap.xml'
]

/**
 * Finds the first existing sitemap file in the dist directory
 */
async function getSitemapThatExists(): Promise<string | undefined> {
    for (const sitemapFile of sitemapFilesToTry) {
        const sitemapPath = `./dist/${sitemapFile}`
        if (await fs.pathExists(sitemapPath)) {
            return sitemapPath
        }
    }
}

describe('Sitemap Tests', () => {
    beforeAll(async () => {
        const sitemapXml = await getSitemapThatExists()
        if (!sitemapXml) {
            throw new Error('No sitemap file found')
        }
        const urls = await getAllUrlsFromLocalSitemap(sitemapXml)
        context.sitemapUrls = urls.map(tag => new URL(tag.loc))
    })

    test('sitemap contains no double slashes in paths', () => {
        const urlsWithDoubleSlashes = context.sitemapUrls
            .filter(url => url.pathname.includes('//'))

        expect(urlsWithDoubleSlashes.length).toBe(0)

        console.log(`${context.sitemapUrls.length} valid sitemap listings`)
    })

    test('sitemap mostly matches production', async () => {
        // Higher threshold for development environment
        const threshold = 400
        const urlsNotOnLive = new Set()

        const liveSitemapUrls = await fetchAllUrlsFromSitemaps(
            'https://doesitarm.com'
        )

        expect(liveSitemapUrls.size).toBeGreaterThan(0)

        for (const localUrl of context.sitemapUrls) {
            const theoreticalLiveUrl = 
                `https://doesitarm.com${localUrl.pathname}`

            if (liveSitemapUrls.has(theoreticalLiveUrl)) {
                liveSitemapUrls.delete(theoreticalLiveUrl)
                continue
            }
        }

        const totalDifferences = 
            urlsNotOnLive.size + liveSitemapUrls.size

        if (urlsNotOnLive.size > 0 || liveSitemapUrls.size > 0) {
            console.log('Missing from live:', urlsNotOnLive)
            console.log('Not found locally:', 
                Array.from(liveSitemapUrls.keys()))
        }

        expect(totalDifferences).toBeLessThan(threshold)
    })
}) 
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { launchBrowser } from './support/astro-browser-test'
import { measureStatusHeadlines, statusHeadlineFixture } from '../helpers/status-headline-fixture.mjs'

let browser: Browser
let html: string
beforeAll(async () => {
    html = await statusHeadlineFixture()
    browser = await launchBrowser()
})
afterAll(async () => { await browser?.close() })

describe('complete status headlines stay readable', () => {
    for (const width of [320, 375, 430, 768, 1024, 1440]) {
        it(`all README statuses fit three lines at ${width}px`, async () => {
            const page = await browser.newPage({ viewport: { width, height: 900 } })
            try {
                await page.setContent(html)
                await page.evaluate(() => document.fonts.ready)
                const rows = await page.evaluate(measureStatusHeadlines)
                expect(rows.length).toBeGreaterThan(800)
                expect(rows.filter(row => row.lines > 3 || row.clipped || row.hidden || row.overflow)).toEqual([])
                if (width >= 1024) expect(rows.filter(row => row.lines > 2)).toEqual([])
            } finally { await page.close() }
        })
    }
    it('allows reflow at 200% text size without clipping', async () => {
        const page = await browser.newPage({ viewport: { width: 320, height: 900 } })
        try {
            await page.setContent(html)
            await page.addStyleTag({ content: 'html { font-size: 40px !important; }' })
            await page.evaluate(() => document.fonts.ready)
            const rows = await page.evaluate(measureStatusHeadlines)
            expect(rows.filter(row => row.clipped || row.hidden || row.overflow)).toEqual([])
        } finally { await page.close() }
    })
})

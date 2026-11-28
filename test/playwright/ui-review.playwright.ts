import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Browser, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchBrowser, startAstroDevServer, stopChildProcess } from './support/astro-browser-test'

let server: Awaited<ReturnType<typeof startAstroDevServer>>
let browser: Browser

beforeAll(async () => {
    if ( !process.env.PLAYWRIGHT_BASE_URL ) {
        await promisify( execFile )( 'pnpm', [ 'build:ui' ], { maxBuffer: 4 * 1024 * 1024 } )
    }
    server = await startAstroDevServer()
    browser = await launchBrowser()
})

afterAll(async () => {
    await browser?.close()
    await stopChildProcess( server?.process ?? null )
})

async function openReview ( page: Page ) {
    const response = await page.goto( `${ server.baseUrl }/ui` )
    expect( response?.status() ).toBe( 200 )
    expect( response?.headers()['x-robots-tag'] ).toBe( 'noindex, nofollow' )
    await page.getByRole( 'heading', { level: 1, name: 'UI review' } ).waitFor()
    expect( await page.locator( 'meta[name="robots"]' ).getAttribute( 'content' ) ).toBe( 'noindex, nofollow' )
}

describe( 'UI review', () => {
    it( 'opens each section and keeps the theme across reloads', async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
        const errors: string[] = []
        page.on( 'pageerror', error => errors.push( error.message ) )
        page.on( 'console', message => {
            if ( message.type() === 'error' ) errors.push( message.text() )
        } )
        try {
            await openReview( page )
            const toc = page.getByRole( 'navigation', { name: 'Table of contents' } )
            for ( const [label, hash] of Object.entries({ Atoms: 'atoms', Components: 'components', Compositions: 'compositions', 'Does It ARM': 'does-it-arm' }) ) {
                await toc.getByRole( 'link', { name: label, exact: true } ).click()
                expect( new URL( page.url() ).hash ).toBe( `#${ hash }` )
                expect( await page.locator( `#${ hash }` ).isVisible() ).toBe( true )
            }

            await toc.getByRole( 'link', { name: 'Components', exact: true } ).click()
            await page.getByRole( 'searchbox', { name: 'Filter components' } ).fill( 'Accordion' )
            const accordion = page.locator( '[data-component="accordion"]' )
            await accordion.locator( 'summary' ).click()
            const returns = accordion.getByRole( 'button', { name: 'What is your return policy?' } )
            await returns.click()
            expect( await returns.getAttribute( 'aria-expanded' ) ).toBe( 'true' )

            await toc.getByRole( 'link', { name: 'Compositions', exact: true } ).click()
            await page.getByRole( 'combobox', { name: 'Composition', exact: true } ).selectOption( 'new-york-v4-login-01' )
            await page.frameLocator( 'iframe[title="Login 01"]' ).getByLabel( 'Email', { exact: true } ).waitFor()

            await page.getByRole( 'button', { name: 'Switch to light theme' } ).click()
            expect( await page.locator( 'html' ).getAttribute( 'data-theme' ) ).toBe( 'light' )
            await page.reload()
            await page.getByRole( 'button', { name: 'Switch to dark theme' } ).click()
            expect( await page.locator( 'html' ).getAttribute( 'data-theme' ) ).toBe( 'dark' )
            expect( errors ).toEqual( [] )
        } finally {
            await page.close()
        }
    })

    it( 'supports keyboard navigation and returns focus from the details drawer on a phone', async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
        try {
            await openReview( page )
            await page.keyboard.press( 'Tab' )
            expect( await page.locator( ':focus' ).textContent() ).toBe( 'Skip to examples' )
            await page.keyboard.press( 'Enter' )
            expect( await page.locator( ':focus' ).getAttribute( 'id' ) ).toBe( 'review-main' )

            const trigger = page.getByRole( 'button', { name: 'View scan details', exact: true } )
            await trigger.focus()
            await page.keyboard.press( 'Enter' )
            const drawer = page.getByRole( 'dialog', { name: 'Visual Studio Code.app' } )
            await drawer.waitFor()
            expect( await drawer.getByText( 'arm64, x86_64' ).isVisible() ).toBe( true )
            await page.keyboard.press( 'Escape' )
            await drawer.waitFor({ state: 'hidden' })
            await page.waitForFunction( () => document.activeElement?.textContent?.trim() === 'View scan details' )
            expect( await page.evaluate( () => document.documentElement.scrollWidth <= window.innerWidth ) ).toBe( true )
        } finally {
            await page.close()
        }
    })

    it( 'passes the gallery shell accessibility checks in both palettes', async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
        try {
            await openReview( page )
            await page.getByRole( 'button', { name: 'View scan details', exact: true } ).waitFor()
            // The compositions toolbar mounts lazily; wait for it so axe sees the selects and the frame.
            await page.locator( '#compositions' ).scrollIntoViewIfNeeded()
            await page.getByRole( 'combobox', { name: 'Collection', exact: true } ).waitFor()
            await page.getByRole( 'combobox', { name: 'Composition', exact: true } ).waitFor()
            await page.locator( 'iframe.review-composition-frame' ).waitFor()
            await page.addScriptTag({ path: resolve( 'ui-review/node_modules/axe-core/axe.min.js' ) })
            const auditShell = () => page.evaluate( async () => {
                const { axe } = window as typeof window & {
                    axe: { run: ( context: object, options: object ) => Promise<{
                        violations: { id: string, nodes: { target: string[] }[] }[]
                    }> }
                }
                const { violations } = await axe.run({
                    include: [ 'html' ],
                    exclude: [ '.review-live-demo' ]
                }, { runOnly: [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ] })
                return violations.map( ({ id, nodes }) => ({ id, targets: nodes.map( ({ target }) => target ) }) )
            })

            expect( await auditShell() ).toEqual( [] )
            await page.getByRole( 'button', { name: 'Switch to light theme' } ).click()
            await page.waitForFunction( () => !document.getAnimations().some( animation => animation instanceof CSSTransition ) )
            expect( await auditShell() ).toEqual( [] )
        } finally {
            await page.close()
        }
    })
})

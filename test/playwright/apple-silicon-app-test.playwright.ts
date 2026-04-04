import type { Browser, Page } from 'playwright-core'
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest'

import {
    launchBrowser,
    startAstroDevServer,
    stopChildProcess,
    type AstroDevServer
} from './support/astro-browser-test'
import {
    createNativeAppArchive,
    type PlaywrightUploadFile
} from './support/app-archive-fixture'

describe( 'Apple Silicon app test page', () => {
    let browser: Browser
    let devServer: AstroDevServer
    let appArchive: PlaywrightUploadFile

    beforeAll( async () => {
        appArchive = await createNativeAppArchive()

        devServer = await startAstroDevServer({
            env: {
                TEST_RESULT_STORE: '/api/test-results'
            },
            preferConfiguredBaseUrl: false
        })

        browser = await launchBrowser()
        await warmAppTestRoute( browser, devServer.baseUrl )
    } )

    afterAll( async () => {
        await browser?.close()
        await stopChildProcess( devServer?.process || null )
    } )

    it( 'uploads an app archive, scans it, and renders a native result', async () => {
        const page = await browser.newPage()
        const consoleErrors: string[] = []
        const pageErrors: string[] = []
        const submittedScans: Record<string, unknown>[] = []

        page.on( 'console', message => {
            if ( message.type() === 'error' ) {
                consoleErrors.push( message.text() )
            }
        } )

        page.on( 'pageerror', error => {
            pageErrors.push( error.message )
        } )

        await stubResultStore( page, submittedScans )

        await page.goto( `${ devServer.baseUrl }/apple-silicon-app-test/`, {
            waitUntil: 'load'
        } )

        await page.waitForFunction( () => {
            const island = document.querySelector( 'astro-island[component-url="/pages/apple-silicon-app-test.vue"]' )

            return Boolean( island && !island.hasAttribute( 'ssr' ) )
        }, {
            timeout: 30 * 1000
        } )

        await page.locator( 'input[type="file"]' ).setInputFiles( appArchive )
        await waitForBodyText( page, 'Total Files: 1', {
            consoleErrors,
            devServerOutput: devServer.output.text,
            pageErrors
        } )

        const firstScanRow = page.locator( '.results-container li' ).first()

        await waitForBodyText( page, 'Playwright Native App', {
            consoleErrors,
            devServerOutput: devServer.output.text,
            pageErrors
        } )
        await waitForBodyText( page, '✅ This app is natively compatible with Apple Silicon!', {
            consoleErrors,
            devServerOutput: devServer.output.text,
            pageErrors
        } )

        await firstScanRow.locator( 'summary' ).click()

        const rowText = await firstScanRow.textContent()

        expect( rowText ).toContain( 'Bundle Identifier' )
        expect( rowText ).toContain( 'com.doesitarm.playwright-native-app' )

        expect( submittedScans.length, devServer.output.text ).toBe( 1 )
        expect( submittedScans[ 0 ]?.filename, JSON.stringify( submittedScans[ 0 ] ) ).toBe( 'Playwright Native App.app.zip' )
        expect( submittedScans[ 0 ]?.result, JSON.stringify( submittedScans[ 0 ] ) ).toBe( '✅' )
        expect( pageErrors, devServer.output.text ).toEqual( [] )
        expect( consoleErrors, devServer.output.text ).toEqual( [] )
    } )
} )

async function stubResultStore ( page: Page, submittedScans: Record<string, unknown>[] ) {
    await page.route( '**/api/test-results', async route => {
        const postData = route.request().postDataJSON()

        if ( postData && typeof postData === 'object' ) {
            submittedScans.push( postData as Record<string, unknown> )
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                supportedVersionNumber: null
            })
        })
    } )
}

async function waitForBodyText ( page: Page, expectedText: string, debugContext: {
    consoleErrors: string[]
    devServerOutput: string
    pageErrors: string[]
} ) {
    try {
        await page.waitForFunction( textToFind => {
            return Boolean( document.body?.textContent?.includes( textToFind ) )
        }, expectedText, {
            timeout: 30 * 1000
        } )
    } catch ( error ) {
        const bodyText = await page.locator( 'body' ).textContent()

        throw new Error( [
            `Timed out waiting for body text: ${ expectedText }`,
            bodyText || '',
            debugContext.pageErrors.join( '\n' ),
            debugContext.consoleErrors.join( '\n' ),
            debugContext.devServerOutput
        ].filter( Boolean ).join( '\n\n' ), {
            cause: error
        } )
    }
}

async function warmAppTestRoute ( browser: Browser, baseUrl: string ) {
    const warmPage = await browser.newPage()

    try {
        await warmPage.goto( `${ baseUrl }/apple-silicon-app-test/`, {
            waitUntil: 'load'
        } )
        await warmPage.waitForTimeout( 5000 )
    } finally {
        await warmPage.close()
    }
}

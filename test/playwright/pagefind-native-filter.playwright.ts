import type { Browser } from 'playwright-core'
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

describe( 'Pagefind dev search', () => {
    let browser: Browser
    let devServer: AstroDevServer

    beforeAll( async () => {
        devServer = await startAstroDevServer({
            env: {
                PUBLIC_SEARCH_PROVIDER: 'pagefind'
            }
        })

        browser = await launchBrowser()
    } )

    afterAll( async () => {
        await browser?.close()
        await stopChildProcess( devServer?.process || null )
    } )

    it( 'renders visible Pagefind results when Native Support is clicked', async () => {
        const page = await browser.newPage()
        const consoleErrors: string[] = []
        const pageErrors: string[] = []
        const pagefindResponses: Array<{
            status: number
            url: string
        }> = []
        const failedRequests: Array<{
            errorText: string
            url: string
        }> = []
        let fragmentRequests = 0
        let failedFragmentRequests = 0

        page.on( 'console', message => {
            if ( message.type() === 'error' ) {
                consoleErrors.push( message.text() )
            }
        } )

        page.on( 'pageerror', error => {
            pageErrors.push( error.message )
        } )

        page.on( 'response', response => {
            if ( response.url().includes( '/pagefind/pagefind.js' ) ) {
                pagefindResponses.push({
                    status: response.status(),
                    url: response.url()
                })
            }
        } )

        page.on( 'request', request => {
            if ( request.url().includes( '/pagefind/' ) && request.url().includes( 'pf_fragment' ) ) {
                fragmentRequests++
            }
        } )

        page.on( 'requestfailed', request => {
            if ( request.url().includes( '/pagefind/pagefind.js' ) ) {
                failedRequests.push({
                    errorText: request.failure()?.errorText || 'unknown',
                    url: request.url()
                })
            }

            if ( request.url().includes( '/pagefind/' ) && request.url().includes( 'pf_fragment' ) ) {
                failedFragmentRequests++
            }
        } )

        await page.goto( devServer.baseUrl, {
            waitUntil: 'domcontentloaded'
        } )

        await page.waitForTimeout( 3000 )

        await Promise.all([
            page.waitForResponse( response => {
                return response.url().includes( '/pagefind/pagefind.js' )
            }, {
                timeout: 10 * 1000
            } ),
            page.getByRole( 'button', {
                name: /native support/i
            } ).click()
        ])

        await page.waitForFunction( () => {
            return [ ...document.querySelectorAll( 'li[data-app-slug] h3' ) ].some( node => {
                const text = node.textContent || ''
                return text.trim().length > 0 && !/loading/i.test( text )
            } )
        }, {
            timeout: 15 * 1000
        } )

        const bodyText = await page.locator( 'body' ).textContent()
        const renderedResults = await page.evaluate( () => {
            const headings = [ ...document.querySelectorAll( 'li[data-app-slug] h3' ) ].map( node => {
                return ( node.textContent || '' ).trim()
            } )

            return {
                loadingRows: headings.filter( text => /loading/i.test( text ) ).length,
                rows: document.querySelectorAll( 'li[data-app-slug]' ).length,
                visibleHeadings: headings.slice( 0, 5 )
            }
        } )

        expect( pagefindResponses.some( response => response.status === 200 ), devServer.output.text ).toBe( true )
        expect(
            pagefindResponses.some( response => response.status >= 400 ),
            [
                pagefindResponses.map( response => `${ response.status } ${ response.url }` ).join( '\n' ),
                failedRequests.map( request => `${ request.errorText } ${ request.url }` ).join( '\n' ),
                pageErrors.join( '\n' ),
                consoleErrors.join( '\n' )
            ].join( '\n\n' )
        ).toBe( false )
        expect( fragmentRequests, JSON.stringify( renderedResults ) ).toBeGreaterThan( 0 )
        expect( fragmentRequests, JSON.stringify( renderedResults ) ).toBeLessThan( 100 )
        expect( failedFragmentRequests, JSON.stringify( renderedResults ) ).toBe( 0 )
        expect( renderedResults.rows, bodyText ).toBeGreaterThan( 0 )
        expect( renderedResults.loadingRows, JSON.stringify( renderedResults ) ).toBe( 0 )
        expect( bodyText?.includes( 'No results found' ) ?? false, JSON.stringify( renderedResults ) ).toBe( false )
        expect( consoleErrors, devServer.output.text ).toEqual( [] )
        expect( pageErrors, devServer.output.text ).toEqual( [] )

        await page.close()
    } )
} )

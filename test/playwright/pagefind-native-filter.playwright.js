import { accessSync, constants } from 'node:fs'
import { spawn } from 'node:child_process'
import net from 'node:net'

import { chromium } from 'playwright-core'
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest'


const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const host = '127.0.0.1'
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || ''

function canAccessPath ( filePath ) {
    try {
        accessSync( filePath, constants.X_OK )
        return true
    } catch {
        return false
    }
}

function getBrowserExecutablePath () {
    const candidatePaths = [
        process.env.PLAYWRIGHT_BROWSER_PATH,
        process.env.CHROME_BIN,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/opt/homebrew/bin/chromium',
    ].filter( Boolean )

    const executablePath = candidatePaths.find( canAccessPath )

    if ( !executablePath ) {
        throw new Error(`No browser executable found. Set PLAYWRIGHT_BROWSER_PATH or CHROME_BIN.`)
    }

    return executablePath
}

function getAvailablePort () {
    return new Promise( ( resolve, reject ) => {
        const server = net.createServer()

        server.unref()
        server.on( 'error', reject )
        server.listen( 0, host, () => {
            const { port } = server.address()
            server.close( err => {
                if ( err ) {
                    reject( err )
                    return
                }

                resolve( port )
            } )
        } )
    } )
}

async function waitForServer ( url, {
    intervalMs = 250,
    timeoutMs = 60 * 1000
} = {} ) {
    const startedAt = Date.now()

    while ( Date.now() - startedAt < timeoutMs ) {
        try {
            const response = await fetch( url )

            if ( response.ok ) {
                return
            }
        } catch {}

        await new Promise( resolve => setTimeout( resolve, intervalMs ) )
    }

    throw new Error(`Timed out waiting for dev server at ${ url }`)
}

function stopProcess ( childProcess ) {
    return new Promise( resolve => {
        if ( !childProcess ) {
            resolve()
            return
        }

        if ( childProcess.killed || childProcess.exitCode !== null ) {
            resolve()
            return
        }

        childProcess.once( 'exit', () => resolve() )
        childProcess.kill( 'SIGTERM' )

        setTimeout( () => {
            if ( childProcess.exitCode === null ) {
                childProcess.kill( 'SIGKILL' )
            }
        }, 5 * 1000 ).unref()
    } )
}

describe('Pagefind dev search', () => {
    let browser
    let devServer
    let devServerOutput = ''
    let baseUrl = ''

    beforeAll( async () => {
        const executablePath = getBrowserExecutablePath()
        if ( configuredBaseUrl.length > 0 ) {
            baseUrl = configuredBaseUrl
        } else {
            const port = await getAvailablePort()

            baseUrl = `http://${ host }:${ port }`

            devServer = spawn( command, [
                'exec',
                'astro',
                'dev',
                '--host',
                host,
                '--port',
                String( port )
            ], {
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    PUBLIC_SEARCH_PROVIDER: 'pagefind'
                },
                stdio: [ 'ignore', 'pipe', 'pipe' ]
            } )

            devServer.stdout.on( 'data', chunk => {
                devServerOutput += chunk.toString()
            } )
            devServer.stderr.on( 'data', chunk => {
                devServerOutput += chunk.toString()
            } )
        }

        await waitForServer( baseUrl )

        browser = await chromium.launch({
            executablePath,
            headless: true
        } )
    } )

    afterAll( async () => {
        await browser?.close()
        await stopProcess( devServer )
    } )

    it('renders visible Pagefind results when Native Support is clicked', async () => {
        const page = await browser.newPage()
        const consoleErrors = []
        const pageErrors = []
        const pagefindResponses = []
        const failedRequests = []
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

        await page.goto( baseUrl, {
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

        expect( pagefindResponses.some( response => response.status === 200 ), devServerOutput ).toBe( true )
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
        expect( renderedResults.rows, JSON.stringify( renderedResults ) ).toBeGreaterThan( 0 )
        expect( renderedResults.loadingRows, JSON.stringify( renderedResults ) ).toBe( 0 )
        expect( bodyText ).not.toContain( 'Failed to load url /pagefind/pagefind.js' )
        expect( bodyText ).not.toContain( 'No apps found for' )
        expect( pageErrors.join( '\n' ) ).not.toMatch( /pagefind\/pagefind\.js/ )
        expect( pageErrors.join( '\n' ) ).not.toMatch( /Failed to fetch/ )
        expect( consoleErrors.join( '\n' ) ).not.toMatch( /pagefind\/pagefind\.js/ )
        expect( consoleErrors.join( '\n' ) ).not.toMatch( /ERR_INSUFFICIENT_RESOURCES/ )

        await page.close()
    } )
} )

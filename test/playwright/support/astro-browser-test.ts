import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import net from 'node:net'

import { chromium, type Browser } from 'playwright-core'

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const host = '127.0.0.1'

export interface AstroDevServer {
    baseUrl: string
    output: {
        text: string
    }
    process: ChildProcessWithoutNullStreams | null
}

function canAccessPath ( filePath: string ) {
    try {
        accessSync( filePath, constants.X_OK )
        return true
    } catch {
        return false
    }
}

export function getBrowserExecutablePath () {
    const candidatePaths = [
        process.env.PLAYWRIGHT_BROWSER_PATH,
        process.env.CHROME_BIN,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/opt/homebrew/bin/chromium',
    ].filter( ( value ): value is string => Boolean( value ) )

    const executablePath = candidatePaths.find( canAccessPath )

    if ( !executablePath ) {
        throw new Error( 'No browser executable found. Set PLAYWRIGHT_BROWSER_PATH or CHROME_BIN.' )
    }

    return executablePath
}

function getAvailablePort () {
    return new Promise<number>( ( resolve, reject ) => {
        const server = net.createServer()

        server.unref()
        server.on( 'error', reject )
        server.listen( 0, host, () => {
            const address = server.address()

            if ( !address || typeof address === 'string' ) {
                reject( new Error( 'Unable to determine a free port.' ) )
                return
            }

            server.close( err => {
                if ( err ) {
                    reject( err )
                    return
                }

                resolve( address.port )
            } )
        } )
    } )
}

export async function waitForServer ( url: string, {
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

    throw new Error( `Timed out waiting for dev server at ${ url }` )
}

export async function startAstroDevServer ( {
    env = {},
    preferConfiguredBaseUrl = true
}: {
    env?: Record<string, string>
    preferConfiguredBaseUrl?: boolean
} = {} ): Promise<AstroDevServer> {
    const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL || ''

    if ( preferConfiguredBaseUrl && configuredBaseUrl.length > 0 ) {
        await waitForServer( configuredBaseUrl )

        return {
            baseUrl: configuredBaseUrl,
            output: { text: '' },
            process: null
        }
    }

    const port = await getAvailablePort()
    const baseUrl = `http://${ host }:${ port }`
    const output = { text: '' }

    const childProcess = spawn( command, [
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
            ...env
        },
        stdio: [ 'ignore', 'pipe', 'pipe' ]
    } )

    childProcess.stdout.on( 'data', chunk => {
        output.text += chunk.toString()
    } )
    childProcess.stderr.on( 'data', chunk => {
        output.text += chunk.toString()
    } )

    await waitForServer( baseUrl )

    return {
        baseUrl,
        output,
        process: childProcess
    }
}

export function stopChildProcess ( childProcess: ChildProcessWithoutNullStreams | null ) {
    return new Promise<void>( resolve => {
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

export async function launchBrowser (): Promise<Browser> {
    return chromium.launch({
        executablePath: getBrowserExecutablePath(),
        headless: true
    })
}

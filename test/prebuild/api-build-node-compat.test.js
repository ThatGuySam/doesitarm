import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Node 26 removed buffer.SlowBuffer. Packages that read it at import time
// (buffer-equal-constant-time, pulled in by googleapis' auth chain)
// crashed every Vercel API build. These tests load the API build's
// modules with SlowBuffer removed, so they catch that class of break
// on any Node version, not only Node 26.

const require = createRequire( import.meta.url )
const nodeBuffer = require( 'node:buffer' )
const repoRoot = process.cwd()

// Packages known to crash, or to pull in something that crashes,
// when SlowBuffer is missing.
const slowBufferPackages = [
    'googleapis',
    'google-auth-library',
    'gtoken',
    'jsonwebtoken',
    'jws',
    'jwa',
    'buffer-equal-constant-time'
]

function getImportSpecifiers ( source ) {
    const specifiers = new Set()
    const patterns = [
        /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
        /^\s*export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gm,
        /import\(\s*['"]([^'"]+)['"]\s*\)/g,
        /require\(\s*['"]([^'"]+)['"]\s*\)/g
    ]

    for ( const pattern of patterns ) {
        for ( const match of source.matchAll( pattern ) ) {
            specifiers.add( match[1] )
        }
    }

    return [ ...specifiers ]
}

function packageNameOf ( specifier ) {
    if ( specifier.startsWith( '@' ) ) {
        return specifier.split( '/' ).slice( 0, 2 ).join( '/' )
    }

    return specifier.split( '/' )[0]
}

function listSourceFiles ( directory ) {
    const files = []

    for ( const entry of readdirSync( directory ) ) {
        const path = join( directory, entry )

        if ( statSync( path ).isDirectory() ) {
            files.push( ...listSourceFiles( path ) )
            continue
        }

        if ( /\.(c|m)?(j|t)s$/.test( entry ) ) {
            files.push( path )
        }
    }

    return files
}

const buildListsImports = getImportSpecifiers(
    readFileSync( join( repoRoot, 'build-lists.js' ), 'utf8' )
)

describe( 'API build on Node runtimes without SlowBuffer', () => {
    let originalSlowBuffer
    let hadSlowBuffer

    beforeAll( () => {
        hadSlowBuffer = Object.prototype.hasOwnProperty.call( nodeBuffer, 'SlowBuffer' )
        originalSlowBuffer = nodeBuffer.SlowBuffer

        // Behave like Node 26+ even when the tests run on Node 24
        delete nodeBuffer.SlowBuffer
    } )

    afterAll( () => {
        if ( hadSlowBuffer ) {
            nodeBuffer.SlowBuffer = originalSlowBuffer
        }
    } )

    it( 'actually removes SlowBuffer for the checks below', () => {
        expect( require( 'node:buffer' ).SlowBuffer ).toBeUndefined()
    } )

    it( 'finds the modules build-lists.js imports', () => {
        expect( buildListsImports ).toContain( '~/helpers/api/youtube/build.js' )
        expect( buildListsImports.length ).toBeGreaterThan( 10 )
    } )

    // build-lists.js starts the full build as soon as it is imported,
    // so load each of its imports instead of the file itself.
    it.each( buildListsImports )( 'loads %s', async specifier => {
        await expect( import( /* @vite-ignore */ specifier ) ).resolves.toBeDefined()
    }, 60 * 1000 )

    it( 'loads the YouTube build helpers', async () => {
        const youtubeBuild = await import( '~/helpers/api/youtube/build.js' )

        expect( typeof youtubeBuild.saveYouTubeVideos ).toBe( 'function' )
        expect( typeof youtubeBuild.getPlaylistsItems ).toBe( 'function' )
        expect( typeof youtubeBuild.getYouTubeVideos ).toBe( 'function' )
    } )
} )

describe( 'dependencies that break on Node 26', () => {
    it( 'are not direct dependencies', () => {
        const packageJson = JSON.parse( readFileSync( join( repoRoot, 'package.json' ), 'utf8' ) )
        const directDependencies = Object.keys({
            ...packageJson.dependencies,
            ...packageJson.devDependencies
        })

        expect( directDependencies.filter( name => slowBufferPackages.includes( name ) ) ).toEqual( [] )
    } )

    it( 'are not imported by build code', () => {
        const buildFiles = [
            join( repoRoot, 'build-lists.js' ),
            ...listSourceFiles( join( repoRoot, 'helpers' ) ),
            ...listSourceFiles( join( repoRoot, 'scripts' ) )
        ]

        const offenders = []

        for ( const file of buildFiles ) {
            const specifiers = getImportSpecifiers( readFileSync( file, 'utf8' ) )

            for ( const specifier of specifiers ) {
                if ( slowBufferPackages.includes( packageNameOf( specifier ) ) ) {
                    offenders.push( `${ relative( repoRoot, file ) } imports ${ specifier }` )
                }
            }
        }

        expect( offenders ).toEqual( [] )
    } )
} )

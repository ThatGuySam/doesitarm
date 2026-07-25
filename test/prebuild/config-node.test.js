import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import {
    getNetlifyConfigPath,
    getNetlifyRedirect,
    PageHead
} from '~/helpers/config-node.js'

const originalCwd = process.cwd()

afterEach(() => {
    process.chdir( originalCwd )
})

describe( 'netlify config helpers', () => {
    it( 'resolves netlify.toml even when cwd is outside the repo root', async () => {
        const tempDirectory = await fs.mkdtemp( path.join( os.tmpdir(), 'doesitarm-netlify-' ) )

        process.chdir( tempDirectory )

        const configPath = await getNetlifyConfigPath()

        expect( configPath ).toBe( path.join( originalCwd, 'netlify.toml' ) )
    })

    it( 'loads redirects when cwd is outside the repo root', async () => {
        const tempDirectory = await fs.mkdtemp( path.join( os.tmpdir(), 'doesitarm-netlify-' ) )

        process.chdir( tempDirectory )

        const redirect = await getNetlifyRedirect( '/app/electron' )

        expect( redirect ).toMatchObject({
            from: '/app/electron',
            to: '/app/electron-framework',
            status: 301
        })
    })
})

describe( 'page head links', () => {
    it( 'adds a self-canonical without dropping preconnect links', () => {
        const pageHead = new PageHead({
            domain: 'https://doesitarm.com',
            pathname: '/device/2026-macbook-neo-a18-pro'
        })

        expect( pageHead.linkMarkup ).toContain(
            '<link rel="canonical" href="https://doesitarm.com/device/2026-macbook-neo-a18-pro">'
        )
        expect( pageHead.linkMarkup.match( /rel="preconnect"/gu ) ).toHaveLength( 4 )
    })
})

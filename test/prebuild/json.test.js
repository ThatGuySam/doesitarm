import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { streamToJson } from '~/helpers/json.js'

const temporaryFiles = []

async function makeTemporaryJsonPath () {
    const temporaryDirectory = await fs.mkdtemp(
        path.join( os.tmpdir(), 'doesitarm-json-' )
    )
    const filePath = path.join( temporaryDirectory, 'stream.json' )

    temporaryFiles.push( temporaryDirectory )

    return filePath
}

afterEach( async () => {
    for ( const temporaryDirectory of temporaryFiles.splice( 0 ) ) {
        await fs.rm( temporaryDirectory, {
            recursive: true,
            force: true
        })
    }
})

describe( 'streamToJson', () => {
    it( 'writes valid JSON without a trailing comma', async () => {
        const filePath = await makeTemporaryJsonPath()
        const records = [
            { route: '/one', payload: { count: 1 } },
            { route: '/two', payload: { count: 2 } }
        ]

        await streamToJson( records, filePath )

        const storedJson = await fs.readFile( filePath, 'utf8' )

        expect( storedJson ).not.toContain( ',]' )
        expect( JSON.parse( storedJson ) ).toEqual( records )
    })

    it( 'accepts an iterable without first building a second array', async () => {
        const filePath = await makeTemporaryJsonPath()

        function * records () {
            yield { route: '/one' }
            yield { route: '/two' }
        }

        await streamToJson( records(), filePath )

        await expect(
            fs.readFile( filePath, 'utf8' ).then( JSON.parse )
        ).resolves.toHaveLength( 2 )
    })
})

import { Buffer } from 'buffer'

import {
    describe,
    expect,
    it
} from 'vitest'

import {
    File,
    FileReader,
    type FileReaderLoadEvent
} from '~/helpers/scanner/file-api'

describe( 'scanner file api shim', () => {
    it( 'constructs a file from a buffer payload', () => {
        const file = new File({
            buffer: Buffer.from( 'hello world', 'utf8' ),
            name: 'hello.txt',
            type: 'text/plain'
        })

        expect( file.name ).toBe( 'hello.txt' )
        expect( file.type ).toBe( 'text/plain' )
        expect( file.size ).toBe( 11 )
    } )

    it( 'reads text content through the node FileReader shim', async () => {
        const file = new File({
            buffer: Buffer.from( 'scanner-text', 'utf8' ),
            name: 'scanner.txt',
            type: 'text/plain'
        })
        const reader = new FileReader()

        const loadedText = await new Promise<string>( ( resolve, reject ) => {
            reader.onerror = reject
            reader.onload = event => {
                const loadEvent = event as FileReaderLoadEvent

                resolve( String( loadEvent.target.result ) )
            }

            reader.readAsText( file )
        } )

        expect( loadedText ).toBe( 'scanner-text' )
    } )

    it( 'reads binary content through the node FileReader shim', async () => {
        const file = new File({
            buffer: Buffer.from( [ 0xde, 0xad, 0xbe, 0xef ] ),
            name: 'scanner.bin',
            type: 'application/octet-stream'
        })
        const reader = new FileReader()

        const loadedBuffer = await new Promise<Buffer>( ( resolve, reject ) => {
            reader.onerror = reject
            reader.onload = event => {
                const loadEvent = event as FileReaderLoadEvent

                resolve( loadEvent.target.nodeBufferResult )
            }

            reader.readAsArrayBuffer( file )
        } )

        expect( Buffer.isBuffer( loadedBuffer ) ).toBe( true )
        expect( loadedBuffer.toString( 'hex' ) ).toBe( 'deadbeef' )
    } )
} )

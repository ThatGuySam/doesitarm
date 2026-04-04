// Adapted for browser+node from https://github.com/joeferner/node-bplist-parser/blob/master/bplistParser.js
import plainTextPlist from 'plist'
import { Buffer } from 'buffer/index.js'

const debug = false

export const maxObjectSize = 100 * 1000 * 1000
export const maxObjectCount = 32768

const EPOCH = 978307200000
type NodeBuffer = ReturnType<typeof Buffer.from>

export class UID {
    UID: number

    constructor ( id: number ) {
        this.UID = id
    }
}

type PlistValue =
    | null
    | boolean
    | number
    | bigint
    | string
    | Date
    | Buffer
    | UID
    | PlistValue[]
    | { [ key: string ]: PlistValue }

export function parsePlistBuffer (
    fileBuffer: Uint8Array | NodeBuffer,
    callback?: ( error: Error | null, result?: PlistValue ) => void
) {
    return new Promise<PlistValue>( ( resolve, reject ) => {
        function tryParseBuffer ( buffer: Uint8Array | NodeBuffer ) {
            let error: Error | null = null
            let result: PlistValue | undefined

            try {
                result = parseBuffer( buffer )
                resolve( result )
            } catch ( caughtError ) {
                error = caughtError as Error
                reject( error )
            } finally {
                if ( callback ) {
                    callback( error, result )
                }
            }
        }

        tryParseBuffer( fileBuffer )
    } )
}

export function parseFileSync ( fileNameOrBuffer: Uint8Array | NodeBuffer ) {
    return parseBuffer( fileNameOrBuffer )
}

function parseBuffer ( inputBuffer: Uint8Array | NodeBuffer ): PlistValue {
    const buffer = Buffer.from( inputBuffer )
    const header = buffer.slice( 0, 'bplist'.length ).toString( 'utf8' )
    const isPlainTextPlist = header.includes( '<?xml' )

    if ( isPlainTextPlist ) {
        return plainTextPlist.parse( buffer.toString( 'utf8' ) ) as PlistValue
    }

    if ( header !== 'bplist' ) {
        throw new Error( "Invalid binary plist. Expected 'bplist' at offset 0." )
    }

    const trailer = buffer.slice( buffer.length - 32, buffer.length )
    const offsetSize = trailer.readUInt8( 6 )

    if ( debug ) {
        console.log( `offsetSize: ${ offsetSize }` )
    }

    const objectRefSize = trailer.readUInt8( 7 )
    const numObjects = readUInt64BE( trailer, 8 )
    const topObject = readUInt64BE( trailer, 16 )
    const offsetTableOffset = readUInt64BE( trailer, 24 )

    if ( debug ) {
        console.log( `objectRefSize: ${ objectRefSize }` )
        console.log( `numObjects: ${ numObjects }` )
        console.log( `topObject: ${ topObject }` )
        console.log( `offsetTableOffset: ${ offsetTableOffset }` )
    }

    if ( numObjects > maxObjectCount ) {
        throw new Error( 'maxObjectCount exceeded' )
    }

    const offsetTable: number[] = []

    for ( let index = 0; index < numObjects; index += 1 ) {
        const offsetBytes = buffer.slice(
            offsetTableOffset + index * offsetSize,
            offsetTableOffset + ( index + 1 ) * offsetSize
        )

        offsetTable[ index ] = readUInt( offsetBytes, 0 )

        if ( debug ) {
            console.log( `Offset for Object #${ index } is ${ offsetTable[ index ] } [${ offsetTable[ index ].toString( 16 ) }]` )
        }
    }

    function parseObject ( tableOffset: number ): PlistValue {
        const offset = offsetTable[ tableOffset ]
        const type = buffer[ offset ]
        const objType = ( type & 0xF0 ) >> 4
        const objInfo = ( type & 0x0F )

        switch ( objType ) {
        case 0x0:
            return parseSimple()
        case 0x1:
            return parseInteger()
        case 0x8:
            return parseUID()
        case 0x2:
            return parseReal()
        case 0x3:
            return parseDate()
        case 0x4:
            return parseData()
        case 0x5:
            return parsePlistString()
        case 0x6:
            return parsePlistString( true )
        case 0xA:
            return parseArray()
        case 0xD:
            return parseDictionary()
        default:
            throw new Error( `Unhandled type 0x${ objType.toString( 16 ) }` )
        }

        function parseSimple (): PlistValue {
            switch ( objInfo ) {
            case 0x0:
                return null
            case 0x8:
                return false
            case 0x9:
                return true
            case 0xF:
                return null
            default:
                throw new Error( `Unhandled simple type 0x${ objType.toString( 16 ) }` )
            }
        }

        function bufferToHexString ( inputBuffer: NodeBuffer ) {
            let result = ''
            let index = 0

            for ( ; index < inputBuffer.length; index += 1 ) {
                if ( inputBuffer[ index ] !== 0x00 ) {
                    break
                }
            }

            for ( ; index < inputBuffer.length; index += 1 ) {
                const part = `00${ inputBuffer[ index ].toString( 16 ) }`
                result += part.slice( part.length - 2 )
            }

            return result
        }

        function parseInteger (): PlistValue {
            const length = Math.pow( 2, objInfo )

            if ( length >= maxObjectSize ) {
                throw new Error( `Too little heap space available! Wanted to read ${ length } bytes, but only ${ maxObjectSize } are available.` )
            }

            const data = buffer.slice( offset + 1, offset + 1 + length )

            if ( length === 16 ) {
                const hex = bufferToHexString( data )
                return BigInt( `0x${ hex }` )
            }

            return data.reduce( ( accumulator, currentValue ) => {
                accumulator <<= 8
                accumulator |= currentValue & 255
                return accumulator
            }, 0 )
        }

        function parseUID (): PlistValue {
            const length = objInfo + 1

            if ( length >= maxObjectSize ) {
                throw new Error( `Too little heap space available! Wanted to read ${ length } bytes, but only ${ maxObjectSize } are available.` )
            }

            return new UID( readUInt( buffer.slice( offset + 1, offset + 1 + length ) ) )
        }

        function parseReal (): PlistValue {
            const length = Math.pow( 2, objInfo )

            if ( length >= maxObjectSize ) {
                throw new Error( `Too little heap space available! Wanted to read ${ length } bytes, but only ${ maxObjectSize } are available.` )
            }

            const realBuffer = buffer.slice( offset + 1, offset + 1 + length )

            if ( length === 4 ) {
                return realBuffer.readFloatBE( 0 )
            }

            if ( length === 8 ) {
                return realBuffer.readDoubleBE( 0 )
            }

            throw new Error( `Unsupported real length ${ length }` )
        }

        function parseDate (): PlistValue {
            if ( objInfo !== 0x3 ) {
                console.error( `Unknown date type :${ objInfo }. Parsing anyway...` )
            }

            const dateBuffer = buffer.slice( offset + 1, offset + 9 )
            return new Date( EPOCH + ( 1000 * dateBuffer.readDoubleBE( 0 ) ) )
        }

        function readLength ( kind: string ) {
            let dataOffset = 1
            let length = objInfo

            if ( objInfo === 0xF ) {
                const intTypeByte = buffer[ offset + 1 ]
                const intType = ( intTypeByte & 0xF0 ) / 0x10

                if ( intType !== 0x1 ) {
                    console.error( `${ kind }: UNEXPECTED LENGTH-INT TYPE! ${ intType }` )
                }

                const intInfo = intTypeByte & 0x0F
                const intLength = Math.pow( 2, intInfo )
                dataOffset = 2 + intLength
                length = readUInt( buffer.slice( offset + 2, offset + 2 + intLength ) )
            }

            return {
                dataOffset,
                length
            }
        }

        function parseData (): PlistValue {
            const { dataOffset, length } = readLength( '0x4' )

            if ( length >= maxObjectSize ) {
                throw new Error( `Too little heap space available! Wanted to read ${ length } bytes, but only ${ maxObjectSize } are available.` )
            }

            return buffer.slice( offset + dataOffset, offset + dataOffset + length )
        }

        function parsePlistString ( isUtf16 = false ): PlistValue {
            let encoding: BufferEncoding = 'utf8'
            const { dataOffset, length: rawLength } = readLength( 'string' )
            const length = rawLength * ( isUtf16 ? 2 : 1 )

            if ( length >= maxObjectSize ) {
                throw new Error( `Too little heap space available! Wanted to read ${ length } bytes, but only ${ maxObjectSize } are available.` )
            }

            let plistString = Buffer.from( buffer.slice( offset + dataOffset, offset + dataOffset + length ) )

            if ( isUtf16 ) {
                plistString = swapBytes( plistString )
                encoding = 'ucs2'
            }

            return plistString.toString( encoding )
        }

        function parseArray (): PlistValue {
            const { dataOffset, length } = readLength( '0xa' )

            if ( length * objectRefSize > maxObjectSize ) {
                throw new Error( 'Too little heap space available!' )
            }

            const array: PlistValue[] = []

            for ( let index = 0; index < length; index += 1 ) {
                const objectRef = readUInt(
                    buffer.slice(
                        offset + dataOffset + index * objectRefSize,
                        offset + dataOffset + ( index + 1 ) * objectRefSize
                    )
                )

                array[ index ] = parseObject( objectRef )
            }

            return array
        }

        function parseDictionary (): PlistValue {
            const { dataOffset, length } = readLength( '0xd' )

            if ( length * 2 * objectRefSize > maxObjectSize ) {
                throw new Error( 'Too little heap space available!' )
            }

            const dictionary: Record<string, PlistValue> = {}

            for ( let index = 0; index < length; index += 1 ) {
                const keyRef = readUInt(
                    buffer.slice(
                        offset + dataOffset + index * objectRefSize,
                        offset + dataOffset + ( index + 1 ) * objectRefSize
                    )
                )
                const valueRef = readUInt(
                    buffer.slice(
                        offset + dataOffset + length * objectRefSize + index * objectRefSize,
                        offset + dataOffset + length * objectRefSize + ( index + 1 ) * objectRefSize
                    )
                )
                const key = parseObject( keyRef )

                if ( typeof key !== 'string' ) {
                    throw new Error( 'Dictionary key is not a string' )
                }

                dictionary[ key ] = parseObject( valueRef )
            }

            return dictionary
        }
    }

    return parseObject( topObject )
}

function readUInt64BE ( buffer: NodeBuffer, offset: number ) {
    const data = buffer.slice( offset, offset + 8 )

    return data.reduce( ( accumulator, currentValue ) => {
        accumulator <<= 8
        accumulator |= currentValue & 0xff
        return accumulator
    }, 0 )
}

function readUInt ( buffer: NodeBuffer, start = 0 ) {
    return buffer.slice( start ).reduce( ( accumulator, currentValue ) => {
        accumulator <<= 8
        accumulator |= currentValue & 0xff
        return accumulator
    }, 0 )
}

function swapBytes ( buffer: NodeBuffer ) {
    const length = buffer.length

    if ( length % 2 !== 0 ) {
        throw new Error( 'Buffer length must be even' )
    }

    for ( let index = 0; index < length; index += 2 ) {
        const currentValue = buffer[ index ]
        buffer[ index ] = buffer[ index + 1 ]
        buffer[ index + 1 ] = currentValue
    }

    return buffer
}

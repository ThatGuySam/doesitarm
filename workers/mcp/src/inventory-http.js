import { checkInventory, INVENTORY_LIMITS } from './inventory.js'
import { decodeInventoryFile, InventoryUploadError, RAW_LIMITS, RAW_SIZE_ERROR } from './raw-inventory.js'
import { UNAVAILABLE_TEXT } from './server.js'
import { ToolInputError } from './tools.js'

const multipartOverhead = 16 * 1024
const contentTypes = { 'text/csv': 'csv', 'application/json': 'json' }
const mediaType = value => value.split( ';', 1 )[0].trim().toLowerCase()

function json ( data, status = 200 ) {
    return Response.json( data, { status, headers: { 'Cache-Control': 'no-store' } } )
}

async function readBytes ( request, maxBytes ) {
    if ( Number( request.headers.get( 'Content-Length' ) ) > maxBytes ) throw new InventoryUploadError( RAW_SIZE_ERROR, 413 )
    if ( !request.body ) throw new InventoryUploadError( 'Inventory file is required.' )

    const reader = request.body.getReader()
    const chunks = []
    let size = 0
    try {
        for ( ;; ) {
            const { done, value } = await reader.read()
            if ( done ) break
            size += value.byteLength
            if ( size > maxBytes ) {
                // Cancellation can wait for the client stream, so do not await it.
                void reader.cancel().catch( () => {} )
                throw new InventoryUploadError( RAW_SIZE_ERROR, 413 )
            }
            chunks.push( value )
        }
    } finally {
        reader.releaseLock()
    }

    const bytes = new Uint8Array( size )
    let offset = 0
    for ( const chunk of chunks ) {
        bytes.set( chunk, offset )
        offset += chunk.byteLength
    }
    return bytes
}

async function readUpload ( request ) {
    const typeHeader = request.headers.get( 'Content-Type' ) || ''
    const type = mediaType( typeHeader )
    if ( Object.hasOwn( contentTypes, type ) ) {
        return { [contentTypes[type]]: decodeInventoryFile( await readBytes( request, RAW_LIMITS.maxBytes ) ) }
    }
    if ( type !== 'multipart/form-data' ) {
        throw new InventoryUploadError( 'Content-Type must be text/csv, application/json, or multipart/form-data.', 415 )
    }

    const bytes = await readBytes( request, RAW_LIMITS.maxBytes + multipartOverhead )
    let parts
    try {
        parts = await new Response( bytes, { headers: { 'Content-Type': typeHeader } } ).formData()
    } catch {
        throw new InventoryUploadError( 'Malformed multipart inventory upload.' )
    }
    const file = parts.get( 'file' )
    if ( [ ...parts ].length !== 1 || !file || typeof file === 'string' ) {
        throw new InventoryUploadError( 'Multipart inventory requires one file in the file field.' )
    }
    if ( file.size > RAW_LIMITS.maxBytes ) throw new InventoryUploadError( RAW_SIZE_ERROR, 413 )
    const fileType = mediaType( file.type )
    const kind = Object.hasOwn( contentTypes, fileType ) ? contentTypes[fileType]
        : /\.(csv|tsv|json)$/i.exec( file.name )?.[1].toLowerCase()
    if ( !kind ) throw new InventoryUploadError( 'Multipart file must be CSV, TSV, or JSON.', 415 )
    return { [kind === 'tsv' ? 'csv' : kind]: decodeInventoryFile( new Uint8Array( await file.arrayBuffer() ) ) }
}

function pageParameter ( params, name, min, max ) {
    const value = params.get( name )
    if ( value === null ) return undefined
    const number = Number( value )
    if ( !/^\d+$/.test( value ) || number < min || number > max ) {
        throw new InventoryUploadError( `${ name } must be a whole number from ${ min } to ${ max }.` )
    }
    return number
}

export async function handleInventoryUpload ( request, params, data ) {
    try {
        const limit = pageParameter( params, 'limit', 1, INVENTORY_LIMITS.maxLimit )
        const offset = pageParameter( params, 'offset', 0, RAW_LIMITS.maxRows - 1 )
        const format = params.get( 'format' ) ?? undefined
        let input
        try {
            input = await readUpload( request )
        } catch ( error ) {
            if ( error instanceof ToolInputError ) throw error
            throw new InventoryUploadError( 'Inventory upload could not be read.' )
        }
        const result = await checkInventory( { ...input, limit, offset, format }, data )
        return { response: json( result.data ), rows: result.data.counts.received }
    } catch ( error ) {
        if ( error instanceof ToolInputError ) return { response: json( { error: error.message }, error.status ?? 400 ) }
        return { response: json( { error: UNAVAILABLE_TEXT }, 503 ) }
    }
}

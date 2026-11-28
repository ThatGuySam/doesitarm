import { decode, detectCsvProfile, detectJsonProfile, InventoryRowLimitError, parseInventory, rawFormats, readJson } from 'doesitarm-inventory-import/formats'

import { ToolInputError } from './tools.js'

export const RAW_FORMATS = rawFormats
export const RAW_LIMITS = { maxBytes: 1024 * 1024, maxRows: 5000 }
export const RAW_SIZE_ERROR = 'Raw inventory must be at most 1048576 bytes (1 MiB).'
export const RAW_FORMAT_ERROR = 'Unknown inventory format. The supported formats are ' + RAW_FORMATS.join(', ') + '.'

export class InventoryUploadError extends ToolInputError {
    constructor ( message, status = 400 ) {
        super( message )
        this.status = status
    }
}

export function decodeInventoryFile ( bytes ) {
    try {
        return decode( bytes )
    } catch {
        throw new InventoryUploadError( 'Inventory must be valid UTF-8 or BOM-marked UTF-16 text.' )
    }
}

// A null result selects the existing app-only CSV path.
export function parseRawInventory ({ format, csv, json }, byteLength ) {
    if ( format !== undefined && !RAW_FORMATS.includes( format ) ) throw new InventoryUploadError( RAW_FORMAT_ERROR )
    const input = csv ?? json
    let serialized
    try {
        serialized = typeof input === 'string' ? input : JSON.stringify( input )
    } catch {
        throw new InventoryUploadError( 'Malformed JSON inventory.' )
    }
    if ( byteLength( serialized ) > RAW_LIMITS.maxBytes ) throw new InventoryUploadError( RAW_SIZE_ERROR, 413 )

    let report = typeof input === 'string' ? input.replace( /^\uFEFF/, '' ) : input
    let delimiter
    if ( csv !== undefined ) {
        if ( !format ) ({ format, delimiter } = detectCsvProfile( report ) ?? {})
        if ( !format ) return null
    } else {
        if ( typeof report === 'string' ) {
            try {
                report = readJson( report )
            } catch {
                throw new InventoryUploadError( 'Malformed JSON inventory.' )
            }
        }
        format ??= detectJsonProfile( report )
        if ( !format ) throw new InventoryUploadError( 'Unrecognized JSON inventory. Supported JSON exports are Jamf Pro inventory and system_profiler.' )
    }

    const isJson = format === 'jamf-pro-inventory' || format === 'system-profiler-json'
    if ( isJson !== ( json !== undefined ) ) throw new InventoryUploadError( 'Inventory format and input type do not match.' )
    try {
        return { format, ...parseInventory( format, report, { delimiter, maxRows: RAW_LIMITS.maxRows } ) }
    } catch ( error ) {
        if ( error instanceof InventoryRowLimitError ) throw new InventoryUploadError( error.message, 413 )
        throw new InventoryUploadError( 'Inventory is malformed or does not match the selected format.' )
    }
}

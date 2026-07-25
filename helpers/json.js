import fs from 'fs'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'

// Write JSON to file via stream
// so that we can handle large JSON files
// that would not normal fit into memory
// or V8 string size limits
export async function streamToJson ( dataArray, filePath ) {
    const output = fs.createWriteStream( filePath, 'utf8' )
    const completion = finished( output )
    let isFirstItem = true

    try {
        output.write( '[' )

        for ( const item of dataArray ) {
            const separator = isFirstItem ? '' : ','
            const chunk = `${ separator }${ JSON.stringify( item ) }`

            if ( !output.write( chunk ) ) {
                await once( output, 'drain' )
            }

            isFirstItem = false
        }

        output.end( ']' )
        await completion
    } catch ( error ) {
        output.destroy()
        await completion.catch( () => {} )
        throw error
    }

    return output
}

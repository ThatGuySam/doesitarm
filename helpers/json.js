import fs from 'fs'

// Write JSON to file via stream
// so that we can handle large JSON files
// that would not normal fit into memory
// or V8 string size limits
export function streamToJson ( dataArray, filePath ) {
    return new Promise( resolve => {
        const output = fs.createWriteStream( filePath, 'utf8' )

        // When the stream is finished
        output.on( 'finish', () => {
            resolve( output )
        })
    
        // Write opening array bracket
        output.write( '[' )

        // Write each item in the array
        for ( const item of dataArray ) {
            output.write( JSON.stringify( item ) + ',' )
        }

        // Write closing array bracket
        output.write( ']' )

        // Close the stream
        output.end()

        // Return the stream
        return output
    })
}
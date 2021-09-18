import fs from 'fs-extra'



const directoriesToTry = [
    './static/',

    // Vercel Serverless Function
    './.next/server/chunks/static'
]

export async function getJsonDirectory () {

    for ( const directory of directoriesToTry ) {
        const directoryExists = await fs.pathExists( directory )

        if ( directoryExists ) {
            return directory
        }
    }

    throw new Error( 'Could not find json directory' )
}

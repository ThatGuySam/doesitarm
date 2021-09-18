import fs from 'fs-extra'

import { getJsonDirectory } from '../../helpers/get-json-directory.js'

let jsonDirectory

class Listing {

    constructor() {
        // // The doc that contains the sheet
        // this.doc = null

        // // The sheet for out data
        // this.sheet = null

        // // The sheet for out data
        // this.rows = null
    }



    async handler (req, res) {
        // const requestUrl = new URL(req.url, 'https://localhost:3000')

        const directoriestoCheck = [
            './',
            './___vc',
            './api',
            // './.next',
            // './.next/server',
            // './.next/server/chunks',
            // './.next/server/chunks/static'
        ]

        const directoriesLookedIn = {}

        try {
            for ( const directory of directoriestoCheck ) {
                const contents = await fs.readdir( directory )

                directoriesLookedIn[directory] = contents
            }
        } catch( error ) {
            console.log('', error)
        }

        // jsonDirectory = await getJsonDirectory()
        // console.log('resultInfo', resultInfo)

        // Set JSON Header
        res.setHeader('Content-Type', 'application/json')

        // Repond with JSON Data
        res.json( {
            // jsonDirectory
            directoriesLookedIn
        } )
    }

}


export default async function (req, res) {
    const lister = new Listing()

    return await lister.handler(req, res)
}

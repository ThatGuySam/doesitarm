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

        jsonDirectory = await getJsonDirectory()
        // console.log('resultInfo', resultInfo)

        // Set JSON Header
        res.setHeader('Content-Type', 'application/json')

        // Repond with JSON Data
        res.json( {
            jsonDirectory
        } )
    }

}


export default async function (req, res) {
    const lister = new Listing()

    return await lister.handler(req, res)
}

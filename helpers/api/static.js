import axios from 'axios'
import 'dotenv/config'

import {
    storkVersion,
    storkExecutableName,
    storkExecutablePath,
    storkTomlPath,
} from '~/helpers/stork/config.js'

export async function downloadStorkToml () {
    const apiUrl = new URL( process.env.PUBLIC_API_DOMAIN )

    apiUrl.pathname = storkTomlPath.replace('/static', '')

    console.log('apiUrl', apiUrl)

    // await axios( apiUrl.toString() )


    axios({
        method: "get",
        url:  apiUrl.toString(),
        responseType: "stream"
    }).then(function (response) {
        response.data.pipe(fs.createWriteStream( storkTomlPath ))
    })
}

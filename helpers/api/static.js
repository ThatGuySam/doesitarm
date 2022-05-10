import fs from 'fs-extra'
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

    const response = await axios({
        method: "get",
        url:  apiUrl.toString(),
    })

    await fs.writeFile( storkTomlPath, response.data, { encoding: null })

    // Get toml file stats
    const stats = await fs.stat( storkTomlPath )
    console.log('TOML is file', storkTomlPath, stats.isFile())
    // console.log('TOML Stats', stats)
}

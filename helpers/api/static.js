import fs from 'fs-extra'
import 'dotenv/config.js'

import {
    // storkVersion,
    // storkExecutableName,
    // storkExecutablePath,
    storkTomlPath,
} from '~/helpers/stork/config.js'
import { getText } from '~/helpers/http.js'

export async function downloadStorkToml () {
    // Check if the toml file exists
    if (fs.existsSync(storkTomlPath)) {
        console.log(`Stork toml file already exists at ${storkTomlPath}`)
        return
    }

    const apiUrl = new URL( process.env.PUBLIC_API_DOMAIN )

    apiUrl.pathname = storkTomlPath.replace('static/', '')

    const storkToml = await getText( apiUrl.toString() )

    await fs.writeFile( storkTomlPath, storkToml, { encoding: null })

    // Get toml file stats
    const stats = await fs.stat( storkTomlPath )
    console.log( stats.isFile() ? '✅' : '❌', 'TOML is file', storkTomlPath )
    // console.log('TOML Stats', stats)
}

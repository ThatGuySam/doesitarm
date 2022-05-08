import execa from 'execa'
import fs from 'fs-extra'
import axios from 'axios'

import { isDarwin } from './helpers/environment.js'


const storkVersion = '1.4.2'

const storkExecutableName = 'stork-executable'
const storkExecutablePath = `./${ storkExecutableName }`

// https://stork-search.net/docs/install
const execDownloadUrls = {
    darwin: `https://files.stork-search.net/releases/v${ storkVersion }/stork-macos-10-15`,
    default: `https://files.stork-search.net/releases/v${ storkVersion }/stork-amazon-linux`
}

;(async () => {
    const envKey = isDarwin() ? 'darwin' : 'default'

    const execDownloadUrl = execDownloadUrls[ envKey ]

    console.log( 'execDownloadUrl', execDownloadUrl )

    // Delete any existing executable
    await fs.remove( storkExecutableName )

    // Download the executable
    await execa( `curl`, [
        execDownloadUrl,

        '-o',
        storkExecutableName
    ])

    // const stat = await fs.stat( storkExecutableName )
    // console.log( 'stat', stat )

    // Make sure the executable is executable
    await fs.chmod( storkExecutableName, '755' )

    const output = await execa( storkExecutableName, [
        '--version'
    ])

    console.log( 'output', output )
})()

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
    await fs.remove( storkExecutablePath )

    // Download the binary
    await execa( `curl`, [
        execDownloadUrl,

        '-o',
        storkExecutableName
    ])


    // Make sure the executable is executable
    await fs.chmod( storkExecutablePath, '755' )

    // Check that our downloaded binary is executable
    // https://stackoverflow.com/a/69897809/1397641
    const stats = await fs.stat( storkExecutablePath )
    const isExecutable = !!(stats.mode & fs.constants.S_IXUSR)
    console.log( 'isExecutable', isExecutable )


    // const access = await fs.access( storkExecutablePath, fs.constants.X_OK)
    // console.log('access', access)

    const { stdout } = await execa( storkExecutablePath, [
        '--version'
    ])

    console.log( 'Stork Version', stdout )


})()

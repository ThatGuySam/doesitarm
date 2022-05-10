import fs from 'fs-extra'
import execa from 'execa'

import { isDarwin } from '~/helpers/environment.js'
import {
    storkVersion,
    storkExecutableName,
    storkExecutablePath,
    storkTomlPath,
    storkIndexPath
} from '~/helpers/stork/config.js'

// https://stork-search.net/docs/install
const execDownloadUrls = {
    darwin: `https://files.stork-search.net/releases/v${ storkVersion }/stork-macos-10-15`,
    default: `https://files.stork-search.net/releases/v${ storkVersion }/stork-ubuntu-20-04`
    // default: `https://files.stork-search.net/releases/v${ storkVersion }/stork-amazon-linux`
}

// Check if a file is executable
// https://stackoverflow.com/a/69897809/1397641
async function isExecutable ( path ) {
    const stats = await fs.stat( path )
    const isExecutable = !!(stats.mode & fs.constants.S_IXUSR)

    return isExecutable
}

// 👩‍💻 Bash Download example - https://github.com/jmooring/hugo-stork/blob/main/build.sh
export async function downloadStorkExecutable () {
    const envKey = isDarwin() ? 'darwin' : 'default'

    const execDownloadUrl = execDownloadUrls[ envKey ]

    // console.log( 'execDownloadUrl', execDownloadUrl )

    // Delete any existing executable
    // so we don't get write errors
    // or false positives from preexisting executable files
    await fs.remove( storkExecutablePath )

    // Download the binary
    await execa( `curl`, [
        execDownloadUrl,

        // Set filename
        '-o',
        storkExecutableName
    ])


    // Set the downloaded binary as executable
    await fs.chmod( storkExecutablePath, '755' )
    // Check that our downloaded binary is executable


    // console.log( 'isExecutable', isExecutable )
    if ( !isExecutable( storkExecutablePath ) ) throw new Error( `Downloaded binary at ${ storkExecutablePath } is not executable.` )


    // Check Stork version
    // so we know our binary is working
    const { stdout } = await execa( storkExecutablePath, [
        '--version'
    ])

    console.log( 'Stork Version', stdout )
    if ( !stdout.includes( storkVersion ) ) throw new Error( 'Stork --version command failed.' )

    return stdout
}


export async function buildIndex () {

    if ( !isExecutable( storkExecutablePath ) ) throw new Error( `Binary at ${ storkExecutablePath } is not executable.` )

    // Check Stork version
    // so we know our binary is working
    const { stdout } = await execa( storkExecutablePath, [
        'build',

        '--input',
        storkTomlPath,

        '--output',
        storkIndexPath
    ])

    console.log( 'Stork Build', stdout )
    if ( !stdout.includes( storkVersion ) ) throw new Error( 'Stork --version command failed.' )

    return stdout
}

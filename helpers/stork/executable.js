// Stork and Netlify - https://stork-search.net/docs/stork-and-netlify
import fs from 'fs-extra'
import execa from 'execa'

import {
    storkVersion,
    storkExecutableName,
    storkExecutablePath,
    storkTomlPath,
    storkIndexPath
} from '~/helpers/stork/config.js'

// Netlify's Ubuntu 24 (Noble) image needs the OpenSSL 3 compatible binary.
export function getStorkExecutableTarget ( {
    platform = process.platform,
    arch = process.arch
} = {} ) {
    if ( platform === 'darwin' ) {
        if ( arch === 'arm64' ) return 'stork-macos-13-arm'

        return 'stork-macos-10-15'
    }

    return 'stork-ubuntu-22-04'
}

// https://stork-search.net/docs/install
export function getStorkExecutableDownloadUrl ( options = {} ) {
    const target = getStorkExecutableTarget( options )

    return `https://files.stork-search.net/releases/v${ storkVersion }/${ target }`
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
    const execDownloadUrl = getStorkExecutableDownloadUrl()

    // console.log( { execDownloadUrl } )

    // Delete any existing executable
    // so we don't get write errors
    // or false positives from preexisting executable files
    await fs.remove( storkExecutablePath )

    // Download the binary
    await execa( `curl`, [
        '-fsSL',
        execDownloadUrl,

        // Set filename
        '-o',
        storkExecutableName
    ])


    // Set the downloaded binary as executable
    await fs.chmod( storkExecutablePath, '755' )
    // Check that our downloaded binary is executable


    // console.log( 'isExecutable', isExecutable )
    if ( !(await isExecutable( storkExecutablePath )) ) throw new Error( `Downloaded binary at ${ storkExecutablePath } is not executable.` )


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

    if ( !(await isExecutable( storkExecutablePath )) ) throw new Error( `Binary at ${ storkExecutablePath } is not executable.` )

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

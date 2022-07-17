
import {
    describe,
    it,
    expect
} from 'vitest'

import path from 'node:path'
// https://github.com/mrmlnc/fast-glob
import glob from 'fast-glob'
import { LocalFileData } from 'get-file-object-from-local-path'
import { Zip } from 'zip-lib'

import { AppScan } from '~/helpers/scanner/client'


const appGlobOptions = {
    onlyFiles: false,
    deep: 1
}

const appsPath = 'test/_artifacts/apps'

const tempPath = 'test/_artifacts/temp'

const plainAppBundles = glob.sync( `${ appsPath }/**/*.app`, appGlobOptions )


async function makeZipFromBundlePath ( bundlePath ) {
    const archivePath = `${ tempPath }/${ bundlePath.split('/').pop() }.zip`

    // console.log( 'archivePath', archivePath )

    const zipLib = new Zip()

    // Adds a folder from the file system, putting its contents at the root of archive
    zipLib.addFolder( bundlePath )

    // Generate zip file.
    await zipLib.archive( archivePath )

    // Create a File Object from the zip file
    // https://developer.mozilla.org/en-US/docs/Web/API/File/File
    const archiveFile = new LocalFileData( archivePath )

    // console.log( 'archiveFile', archiveFile )

    return archiveFile
}


describe.concurrent('Apps', async () => {

    // Compress plain app bundles to zipped File Objects
    for ( const bundlePath of plainAppBundles ) {

        const appName = path.basename( bundlePath )

        // Create a new AppScan instance
        const scan = new AppScan({
            fileLoader: () => makeZipFromBundlePath( bundlePath ),
            messageReceiver: ( details ) => {
                console.log( 'Scan message:', details )
            }
        })

        // Scan the archive
        await scan.start()


        it( `Can read info.plist for ${ appName } bundle` , () => {
            // console.log( 'infoPlist', scan.infoPlist )

            expect( scan.hasInfoPlist ).toBe( true )
        })

        it( `Can read macho meta for entry ${ appName } bundle`, () => {
            // console.log( 'machoMeta', scan.machoMeta )

            expect( scan.hasMachoMeta ).toBe( true )
        })
    }

})



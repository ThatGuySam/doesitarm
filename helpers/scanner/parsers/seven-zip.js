// Original 7z commands - https://sevenzip.osdn.jp/chm/cmdline/commands/index.htm
import SevenZip from '7z-wasm'
// import { Buffer } from 'buffer'

// function async function compressBuffer () {

// }

// Archive directory 7z a archive1.zip subdir\
export async function compress ( input, archivePath ) {
    const sevenZip = await SevenZip()

    // const isBuffer = Buffer.isBuffer( input )

    console.log( 'process.cwd()', input )
    console.log( 'archivePath', archivePath )



    const mountRoot = 'virtual'//input.split( '\\' ).slice( 0, -1 ).join( '\\' )
    sevenZip.FS.mkdir( mountRoot )
    sevenZip.FS.mount( sevenZip.NODEFS, { root: process.cwd() }, mountRoot )
    sevenZip.FS.chdir( mountRoot )

    console.log( 'cwd', sevenZip.FS.cwd() )
    console.log( 'readdir ', sevenZip.FS.readdir( sevenZip.FS.cwd() ) )

    // test/_artifacts/temp/BlueJeans(No Resources).app.zip
    await sevenZip.callMain([ 'a', archivePath, input ])

    return
}

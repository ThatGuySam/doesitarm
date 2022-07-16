import { Blob } from 'buffer'
import plist from 'plist'
// import zip from '@zip.js/zip.js'

import {
    isValidHttpUrl
} from '~/helpers/check-types.js'


// For some reason inline 'import()' works better than 'import from'
// https://gildas-lormeau.github.io/zip.js/
const zip = await import('@zip.js/zip.js')

// https://gildas-lormeau.github.io/zip.js/core-api.html#configuration
zip.configure({
    // Disable Web Workers for SSR since Node doesn't support them yet
    // https://vitejs.dev/guide/env-and-mode.html#env-variables
    useWebWorkers: !import.meta.env.SSR
})


export class AppScan {
    constructor ({
        fileLoader,
        messageReceiver
    }) {

        this.fileLoader = fileLoader
        this.messageReceiver = messageReceiver

        this.status = 'idle'
        this.file = null
        this.bundleFileEntries = []
        this.infoPlist = {}
        this.machoMeta = {}

    }

    sendMessage ( details ) {
        if ( details?.status ) {
            this.status = details.status
        }

        if ( typeof( this.messageReceiver ) === 'function' ) {
            this.messageReceiver( details )
        }
    }

    get hasInfoPlist () {
        return Object.keys( this.infoPlist ).length > 0
    }

    // get bundleExecutablePath () {
    //     if ( !this.hasInfoPlist ) return ''

    //     // There our CFBundleExecutable is a path to the executable
    //     // then use it
    //     if ( this.infoPlist.CFBundleExecutable.includes('/') ) return `/Contents/${ this.infoPlist.CFBundleExecutable }`

    //     // Use default executable path
    //     return `/Contents/MacOS/${ this.infoPlist.CFBundleExecutable }`
    // }

    async readFileEntryData ( fileEntry ) {
        // Get blob data from zip
        // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-entry
        return await fileEntry.getData(
            // writer
            // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-writing
            new zip.TextWriter(),
        )
    }


    async readFileBlob ( File ) {
        return new Promise( ( resolve, reject ) => {
            const fileReader = new zip.BlobReader( new Blob( File.arrayBuffer ) )

            // this.sendMessage({
            //     message: '📖 Setting up BlobReader',
            //     status: 'reading',
            //     data: fileReader
            // })

            fileReader.onload = function () {
                // do something on FileReader onload
                this.sendMessage({
                    message: '📖 Reading file',
                    status: 'reading'
                })
            }

            fileReader.onerror = error => {
                // do something on FileReader onload
                console.error('File Read Error', error)

                reject( new Error('File Read Error', error) )
            }

            fileReader.onprogress = (data) => {
                if (data.lengthComputable) {
                    const progress = parseInt( ((data.loaded / data.total) * 100), 10 );
                    console.log('Read progress', progress)

                    // do something on FileReader onload
                    this.sendMessage({
                        message: `📖 Reading file. ${ progress }% read`,
                        status: 'reading'
                    })
                }
            }

            // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-reading
            const zipReader = new zip.ZipReader( fileReader )

            // zipReader.onload = console.log

            // zipReader.onprogress = console.log

            // zipReader.onerror = console.error

            zipReader
                .getEntries()
                .then( entries => {

                    // do something on entries
                    this.sendMessage({
                        message: '📖 Reading file complete. Entries found',
                        status: 'read'
                    })

                    resolve( entries )
                })

        })
    }

    matchesMacho ( entry ) {
        // Skip files that are deeper than 3 folders
        if ( entry.filename.split('/').length > 4 ) return false

        // Skip folders
        if ( entry.filename.endsWith('/') ) return false

        // `${ appName }.app/Contents/MacOS/${ appName }`
        // Does this entry path match any of our wanted paths
        return [
            // `${ appName }.app/Contents/MacOS/${ appName }`
            `.app/Contents/MacOS/`
        ].some( pathToMatch => {
            return entry.filename.includes( pathToMatch )
        })
    }

    matchesRootInfoPlist ( entry ) {
        // Skip files that are deeper than 2 folders
        if ( entry.filename.split('/').length > 3 ) return false

        // Skip folders
        if ( entry.filename.endsWith('/') ) return false

        // If this entry matches the root info.plist path exactly
        // then we have found the root info.plist
        if ( entry.filename === 'Contents/Info.plist' ) return true

        // Does this entry path match any of our wanted paths
        return [
            // `zoom.us.app/Contents/Info.plist`
            `.app/Contents/Info.plist`,
            `.zip/Contents/Info.plist`
        ].some( pathToMatch => {
            return entry.filename.endsWith( pathToMatch )
        })
    }

    fileEntryType ( fileEntry ) {
        if ( !!fileEntry.directory ) return 'directory'

        if ( this.matchesMacho( fileEntry ) ) return 'macho'

        if ( this.matchesRootInfoPlist( fileEntry ) ) return 'rootInfoPlist'

        // getData

        return 'unknown'
    }

    storeInfoPlist = async ( fileEntry ) => {
        // Throw if we have more than one target file
        if ( this.hasInfoPlist ) {
            throw new Error( 'More than one root info.plist found' )
        }

        const infoXml = await this.readFileEntryData( fileEntry )

        // Parse the Info.plist data
        this.infoPlist = plist.parse( infoXml )

        this.sendMessage({
            message: 'ℹ️ Found Info.plist',
            // data: this.infoPlist,
        })
    }

    // async storeMachoMeta ( fileEntry ) {
    //     const machoData = await this.readFileEntryData( fileEntry )
    // }


    targetFiles = {
        rootInfoPlist: {
            method: this.storeInfoPlist
        },
        // macho: {
        //     method: this.storeMacho,
        // }
    }

    async findTargetFiles () {

        for ( const fileEntry of this.bundleFileEntries ) {
            const type = this.fileEntryType( fileEntry )

            // console.log( 'fileEntry', type, fileEntry.filename )

            // Check if we have a target file
            if ( this.targetFiles[ type ] ) {

                // Call the target file method
                await this.targetFiles[ type ].method( fileEntry )
            }

            // console.log( 'File Entry Type:', type )
        }

    }

    async start () {
        // Load in the file
        this.sendMessage({
            message: '🚛 Loading file...',
            status: 'loading'
        })

        this.file = await this.fileLoader()

        // console.log( 'File:', this.file )

        this.bundleFileEntries = await this.readFileBlob( this.file )

        this.sendMessage({
            message: '🎬 Starting scan',
            status: 'scanning'
        })

        await this.findTargetFiles()


        this.sendMessage({
            message: '🏁 Scan complete',
            status: 'complete'
        })
    }
}

// export class AppScannerClient {

//     constructor ({ messageReceiver }) {

//         const testResultStore = global.$config.testResultStore

//         if ( !isValidHttpUrl( testResultStore ) ) {
//             throw new Error( 'testResultStore is not a valid url' )
//         }

//         this.messageReceiver = messageReceiver
//     }

//     scanQueue = []

//     get unscanned () {
//         return this.scanQueue.filter( scan => scan.status === 'idle' )
//     }

//     get nextScan () {


//     sendMessage ( details ) {
//         if( typeof( this.messageReceiver ) === 'function' ) {
//             messageReceiver( details )
//         }
//     }

//     qeueScan ( File ) {
//         // Create a new scan instance
//         const scan = new AppScan({ File, messageReceiver: this.sendMessage })

//         // Add the scan to the queue
//         this.scanQueue.push( scan )
//     }

//     start () {

//     }
// }

import plist from 'plist'
import axios from 'axios'

import { isString } from './check-types.js'
import parseMacho from './macho/index.js'
import prettyBytes from 'pretty-bytes'


const knownArchiveExtensions = new Set([
    'app',
    'dmg',
    // 'pkg',
    'zip',
    // 'gz',
    // 'bz2'
])

const notAppFileTypes =  new Set([
    'image',
    'text',
    'audio',
    'video'
])

const knownAppExtensions =  new Set([
    '.app',
    '.app.zip'
])

function callWithTimeout(timeout, func) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), timeout)
        func().then(
            response => resolve(response),
            err => reject(new Error(err))
        ).finally(() => clearTimeout(timer))
    })
}


// https://stackoverflow.com/a/35610685/1397641
const arrayChangeHandler = {
    get: function( target, property ) {
        console.log('getting ' + property + ' for ' + target)
        // property is index in this case
        return target[property]
    },
    set: function( target, property, value, receiver ) {
        console.log('setting ' + property + ' for ' + target + ' with value ' + value)
        target[property] = value
        // you have to return true to accept the changes
        return true
    }
}

export function makeObservableArray () {
    const originalArray = []
    const proxyToArray = new Proxy( originalArray, arrayChangeHandler )

    return {
        originalArray,
        proxyToArray
    }
}

let zip = null

export default class AppFilesScanner {

    constructor( {
        observableFilesArray,
        testResultStore,
        zipModule = null
    } ) {
        // Files to process
        this.files = observableFilesArray

        this.testResultStore = testResultStore

        this.zipModule = zipModule
    }

    get zip () {

        if ( this.zipModule ) return this.zipModule

        return zip
    }

    isApp ( file ) {

        if ( file.type.includes('/') && notAppFileTypes.has( file.type.split('/')[0] ) ) return false

        return true
    }

    getStatusMessage () {
        // 'Drag and drop one or multiple apps'

        // return `Searching for apps at ${ file.url }`


    }

    getFileStatusMessage ( file ) {


        // CORS error - 'This page has asked not to be scanned. '

        // Status Code Error - 'This page is not loading properly. '

        // No app urls found - 'No apps found on this page. Try a different page or entering the package URL directly. You can also manually download the package then drop it on here. '

        // 'Found # apps'

        // Fetching / File Loading from drag and drop - 'Loading # apps'

        // Unzipping, archive search and Parsing - 'Processing # of #'

        // Not able to unzip - 'Unable to open package. Try a different file. '

        // No Mach-o binary found - 'Could not find Mac App data in package. Try a different package. '

        // Mach-o Parsing Error - 'Unable to scan package. Try a different one. '

        // No ARM64 Architecture found - 'This App's binary is not compatible with Apple Silicon and will only run via Rosetta 2 translation, however, software vendors will sometimes will ship separate install files for Intel and ARM instead of a single one. You can try submitting the download page link for an app and we'll scan that. '

        // ARM64 Architecture found -
        return 'This App is natively compatible with Apple Silicon!'
    }


    // async scanPageForAppUrls () {

    // }

    // async downloadArchiveFromUrl () {

    // }

    async unzipFile ( file ) {
        if ( !this.zip ) throw new Error('Zip module not loaded')

        const fileReader = new this.zip.BlobReader( file.instance )//new FileReader()

        fileReader.onload = function() {

            // do something on FileReader onload
            console.log('File Read')

            file.statusMessage = '📖 Reading file'
        }

        fileReader.onerror = error => {

            // do something on FileReader onload
            console.error('File Read Error', error)

            throw new Error('File Read Error', error)
        }

        fileReader.onprogress = (data) => {
            if (data.lengthComputable) {
                const progress = parseInt( ((data.loaded / data.total) * 100), 10 );
                console.log('Read progress', progress)

                file.statusMessage = `📖 Reading file. ${ progress }% read`
            }
        }

        // console.log('fileReader', fileReader)

        // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-reading
        const zipReader = new this.zip.ZipReader( fileReader )

        // zipReader.onprogress = console.log

        // zipReader.onerror = console.log

        const entries = await zipReader.getEntries()
            .then( entries => entries.map( entry => {
                return entry

                // return {
                //     filename: entry.filename,
                //     directory: entry.directory
                // }
            }) )
            .catch( error => {
                // console.warn('Unzip Error', error)

                return error
            })

        // console.log('entries', entries)

        if ( !Array.isArray(entries) ) {
            file.statusMessage = '❔ Could not decompress file. Try extracting the app or using a different app file. '
            file.status = 'finished'

            throw new Error('Could not decompress file')

            // return new Error('Could not decompress file')
        }

        return entries
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
            return entry.filename.includes(pathToMatch)
        })
    }

    matchesRootInfo ( entry ) {
        // Skip files that are deeper than 2 folders
        if ( entry.filename.split('/').length > 3 ) return false

        // Skip folders
        if ( entry.filename.endsWith('/') ) return false

        // Does this entry path match any of our wanted paths
        return [
            // `zoom.us.app/Contents/Info.plist`
            `.app/Contents/Info.plist`,
            `.zip/Contents/Info.plist`
        ].some( pathToMatch => {
            return entry.filename.endsWith(pathToMatch)
        })
    }

    findEntries ( entries, matchersObject ) {

        const matches = {}

        // const matcherKeys = Object.keys( matchers )

        // Create a new set to store found App Names
        const appNamesInArchive = new Set()

        // Search App Names in entries
        entries.forEach( entry => {
            // Look through filename parts
            entry.filename.split('/').forEach( filenamePart => {
                if ( filenamePart.includes('.app') ) {
                    const appName = filenamePart.split('.')[0]

                    appNamesInArchive.add( appName )
                }
            } )


            for ( const key in matchersObject ) {

                // Deos it match the matcher method
                const entryMatches = matchersObject[key]( entry )

                if ( entryMatches ) {
                    // If we haven't set up an array for this key
                    // then create one
                    if ( !Array.isArray(matches[key]) ) matches[key] = []

                    // Push this entry to our matching list
                    matches[key].push( entry )
                }
            }

        } )

        return matches
    }

    async parseMachOBlob ( machOBlob, fileName ) {
        const machOFile = new File([machOBlob], fileName)

        return await parseMacho( machOFile )
    }

    getBundleExecutablePath ( info ) {
        if ( info.CFBundleExecutable.includes('/') ) return `/Contents/${ info.CFBundleExecutable }`

        return `/Contents/MacOS/${ info.CFBundleExecutable }`
    }

    classifyBinaryEntryArchitecture ( binaryEntry ) {
        // Find an ARM Architecture
        const armArchitecture = binaryEntry.architectures.find( architecture => {
            // if ( architecture.processorType === 0 ) return false

            // If processorType not a string
            // then return false
            if ( !isString(architecture.processorType) ) return false

            return architecture.processorType.toLowerCase().includes('arm')
        })

        // Was an ARM Architecture found
        return (armArchitecture !== undefined)
    }

    async submitScanInfo ({
        filename,
        appVersion,
        result,
        machoMeta,
        infoPlist
    }) {
        // Each file scanned: Filename, Type(Drop or URL), File URL, Datetime, Architectures, Mach-o Meta

        // console.log( 'this.testResultStore', this.testResultStore )

        const { supportedVersionNumber } = await axios.post( this.testResultStore , {
            filename,
            appVersion,
            result,
            machoMeta: JSON.stringify( machoMeta ),
            infoPlist: JSON.stringify( infoPlist )
        })
            .then( response => response.data )
            .catch(function (error) {
                console.error(error)
            })

        return {
            supportedVersionNumber
        }
    }

    async scanFile ( file, scanIndex ) {

        // If we've already scanned this
        // then skip
        if ( file.status === 'finished' ) return

        if ( !this.isApp( file ) ) {
            file.statusMessage = '⏭ Skipped. Not app or archive'
            file.status = 'finished'

            return
        }

        // console.log('file', file)

        await new Promise(r => setTimeout(r, 1500 * scanIndex))

        file.statusMessage = '🗃 Decompressing file'
        console.log(`Decompressing file at ${ file.size }`)

        let entries

        try {
            entries = await this.unzipFile( file )
        } catch ( Error ) {
            // console.warn( Error )

            this.submitScanInfo ({
                filename: file.name,
                appVersion: null,
                result: 'error_decompression_error',
                machoMeta: null,
                infoPlist: null
            })

            // Set status message as error
            file.statusMessage = `❔ ${ Error.message }`
            file.status = 'finished'

            return
        }

        file.statusMessage = '👀 Scanning App Files'
        console.log(`Searching entries`)

        const foundEntries = this.findEntries( entries, {
            macho: this.matchesMacho,
            rootInfo: this.matchesRootInfo
        })

        // Clean out entries now that we're done with them
        entries = undefined

        // console.log('foundEntries', foundEntries)

        // file.machOEntries = this.findMachOEntries( entries )
        file.machOEntries = foundEntries.macho

        // If no Macho files were found
        // then report and stop
        if ( file.machOEntries.length === 0 ) {
            console.log(`No Macho files found for ${file.name}`, file.machOEntries)

            this.submitScanInfo ({
                filename: file.name,
                appVersion: null,
                result: 'error_no_macho_files',
                machoMeta: null,
                infoPlist: null
            })

            file.statusMessage = `❔ Unkown app format`
            file.status = 'finished'

            return
        }

        // Warn if Info.plist doesn't look right
        if ( foundEntries.rootInfo.length > 1) {
            console.warn('More than one root Info.plist found', foundEntries.rootInfo)
        } else if ( foundEntries.rootInfo.length === 0 ) {
            console.warn('No root Info.plist found', foundEntries.rootInfo)
        }

        // Break out root entry into a variable
        const [ rootInfoEntry ] = foundEntries.rootInfo

        // Get blob data from zip
        // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-entry
        const infoXml = await rootInfoEntry.getData(
            // writer
            // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-writing
            new this.zip.TextWriter(),
            // options
            {
                useWebWorkers: true,
                // onprogress: (index, max) => {

                //     const percentageNumber = (index / max * 100)
                //     // onprogress callback
                //     console.log(`Writer progress ${percentageNumber}`)
                // }
            }
        )

        // Parse the Info.plist data
        const info = plist.parse( infoXml )

        file.appVersion = info.CFBundleShortVersionString
        file.displayName = info.CFBundleDisplayName

        // Set details
        const detailsData = [
            [ 'Version', info.CFBundleShortVersionString ],
            [ 'Bundle Identifier', info.CFBundleIdentifier ],
            [ 'File Mime Type', file.type ],
            [ 'Copyright', info.NSHumanReadableCopyright ],
            // [ 'Version', info.CFBundleShortVersionString ],
        ]

        detailsData.forEach( ([ label, value ]) => {
            if ( !value || value.length === 0 ) return

            file.details.push({
                label,
                value,
            })
        } )

        // console.log('infoFiles', file.name, {
        //     path: rootInfoEntry.filename,
        //     info
        // })


        console.log(`Parsing Macho ${ file.machOEntries.length } files`)

        // console.log('info.CFBundleExecutable', info.CFBundleExecutable)
        // console.log('info', info)
        // console.log('file.machOEntries', file.machOEntries)

        const bundelExecutablePath = this.getBundleExecutablePath( info )

        const bundleExecutables = file.machOEntries.filter( machoEntry => {
            return machoEntry.filename.includes(bundelExecutablePath)
        })

        // Warn if Bundle Executable doesn't look right
        if ( bundleExecutables.length > 1) {
            console.warn('More than one root bundleExecutable found', bundleExecutables)
        } else if ( bundleExecutables.length === 0 ) {
            console.warn('No root bundleExecutable found', bundleExecutables)
        }

        const [ bundleExecutable ] = bundleExecutables

        console.log('Parsing ', bundleExecutable.filename, bundleExecutable.uncompressedSize / 1000 )

        file.displayBinarySize = prettyBytes( bundleExecutable.uncompressedSize )
        file.binarySize = bundleExecutable.uncompressedSize

        // Get blob data from zip
        // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-entry
        const bundleExecutableBlob = await bundleExecutable.getData(
            // writer
            // https://gildas-lormeau.github.io/zip.js/core-api.html#zip-writing
            new this.zip.BlobWriter(),
            // options
            {
                useWebWorkers: true
            }
        )

        const mainExecutableMeta = await this.parseMachOBlob( bundleExecutableBlob, file.name )
        console.log( 'mainExecutableMeta', mainExecutableMeta )

        const binarySupportsNative = this.classifyBinaryEntryArchitecture( mainExecutableMeta )


        // Submit the scan to get any reports on preexisting native reports
        const { supportedVersionNumber } = await this.submitScanInfo ({
            filename: file.name,
            appVersion: file.appVersion,
            result: binarySupportsNative ? '✅' : '🔶',
            machoMeta: {
                ...mainExecutableMeta,
                file: undefined,
                architectures: mainExecutableMeta.architectures.map( architecture => {
                    return {
                        bits: architecture.bits,
                        fileType: architecture.fileType,
                        header: architecture.header,
                        loadCommandsInfo: architecture.loadCommandsInfo,
                        magic: architecture.magic,
                        offset: architecture.offset,
                        processorSubType: architecture.processorSubType,
                        processorType: architecture.processorType,
                    }
                })
            },
            infoPlist: info
        })

        console.log('supportedVersionNumber', supportedVersionNumber)

        let finishedStatusMessage = ''

        if ( binarySupportsNative ) {
            finishedStatusMessage = '✅ This app is natively compatible with Apple Silicon!'

            // Shift this scan to the top
            this.files.unshift( this.files.splice( scanIndex, 1 )[0] )
        } else if ( supportedVersionNumber !== null ) {

            finishedStatusMessage = [
                '✅ A native version of this has been reported',
                (supportedVersionNumber.length > 0) ? `as of v${supportedVersionNumber}` : null
            ].join(' ')

        } else {
            finishedStatusMessage = `🔶 This app file is not natively compatible with Apple Silicon and may only run via Rosetta 2 translation, however, software vendors will sometimes will ship separate install files for Intel and ARM instead of a single one. `
        }

        file.statusMessage = finishedStatusMessage
        file.status = 'finished'

        return
    }

    async scan ( fileList ) {

        // Push files to our files array
        Array.from(fileList).forEach( (fileInstance, scanIndex) => {
            this.files.unshift( {
                status: 'loaded',
                displayName: null,
                statusMessage: '⏳ File Loaded and Qeued',
                details: [],
                appVersion: null,
                displayAppSize: prettyBytes( fileInstance.size ),
                displayBinarySize: null,
                binarySize: null,

                name: fileInstance.name,
                size: fileInstance.size,
                type: fileList.item( scanIndex ).type,
                lastModifiedDate: fileInstance.lastModifiedDate,
                instance: fileInstance,
                item: fileList.item( scanIndex )
            } )
        })

        const scanTimeoutSeconds = 60

        // Scan for archives
        await Promise.all( this.files.map( ( file, scanIndex ) => {
            return new Promise( (resolve, reject) => {

                const timer = setTimeout(() => {
                    file.statusMessage = '❔ Scan timed out'
                    file.status = 'finished'

                    reject(new Error('Scan timed out'))
                }, scanTimeoutSeconds * 1000)

                this.scanFile( file, scanIndex ).then(
                    response => resolve(response),
                    err => reject(new Error(err))
                ).finally(() => clearTimeout(timer))
            })
        }))

        // Go through and set all files to finished to clean up any straglers
        this.files.forEach( file => {
            file.status = 'finished'
        })

        console.log('All Scans Finished')


        return
    }

    async setupZipReader () {
        // https://gildas-lormeau.github.io/zip.js/
        zip = await import('@zip.js/zip.js')

        // console.log( 'zip', zip )

        // https://gildas-lormeau.github.io/zip.js/core-api.html#configuration
        zip.configure({
            workerScripts: true,
            // workerScripts: {
            //     inflate: ["lib/z-worker-pako.js", "pako_inflate.min.js"]
            // }
        })
    }

    get isSetup () {
        return this.zip === null
    }

    async setup () {

        // Setup zip reader if not already done
        if ( !this.zipModule && !zip ) {
            await this.setupZipReader()
        }

    }

}

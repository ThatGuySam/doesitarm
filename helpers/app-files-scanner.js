// import { fs, configure, ZipReader, BlobReader }
// import * as zip from '@zip.js/zip.js'

// import { promises as fs } from 'fs'
// import MarkdownIt from 'markdown-it'
// import slugify from 'slugify'
// import axios from 'axios'

// import statuses from './statuses'
// import parseGithubDate from './parse-github-date'

const knownArchiveExtensions = new Set([
    'dmg',
    'zip',
    'gz',
    'bz2'
])

function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}

function isValidHttpUrl( string ) {
    if ( !isString( string ) ) return false

    let url

    try {
        url = new URL(string)
    } catch (_) {
        return false
    }

    return url.protocol === "http:" || url.protocol === "https:"
}

let zip

export default class AppFilesScanner {

    constructor( { observableFilesArray } ) {
        // Files to process
        this.files = observableFilesArray

        zip = require('@zip.js/zip.js')

        zip.configure({
            workerScripts: false,
            // workerScripts: {
            //     inflate: ["lib/z-worker-pako.js", "pako_inflate.min.js"]
            // }
        })
    }


    fileKind () {
        // if it's not html
        // then return archive

        // otherwise return html
    }

    getStatusMessage () {
        // 'Drag and drop one or multiple apps'

        return `Searching for apps at ${ file.url }`


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

    async unzipFile () {

    }

    findMachOFile () {

    }

    parseMachOFile () {

    }

    classifyArchitecture () {

    }

    submitScanInfo () {
        // Each file scanned: Filename, Type(Drop or URL), File URL, Datetime, Architectures, Mach-o Meta
    }

    async scan ( fileList ) {

        // if ( isValidHttpUrl( filesOrUrl ) ) {
        //     const url = filesOrUrl
        //     // Fetch resource
        //     fetch( url, {
        //         mode: 'no-cors'
        //     })
        //         .then(response => console.log('response', response))
        //         // .then(data => console.log(data));

        //     // Determine
        // }

        console.log('this.files', this.files)
        // console.log('zip', zip)

        // Push files to
        Array.from(fileList).forEach( (fileInstance, index) => {
            this.files.unshift( {
                status: 'selected',
                name: fileInstance.name,
                size: fileInstance.size,
                type: fileList.item( index ).type,
                lastModifiedDate: fileInstance.lastModifiedDate,
                instance: fileInstance,
                item: fileList.item( index )
            } )
        })

        await Promise.all( this.files.map( async (file, index) => {
            const fileReader = new zip.BlobReader(file.instance)//new FileReader()

            console.log('file', file)

            await new Promise(r => setTimeout(r, 1000 * index))

            fileReader.onload = function() {

                // do something on FileReader onload
                console.log('File Read')
            }

            fileReader.onerror = error => {

                // do something on FileReader onload
                console.log('File Read Error', error)
            }

            fileReader.onprogress = (data) => {
                if (data.lengthComputable) {
                    const progress = parseInt( ((data.loaded / data.total) * 100), 10 );
                    console.log('Read progress', progress)

                    this.files[index].progress = progress
                }
            }

            // console.log('fileReader', fileReader)

            const model = new zip.ZipReader( fileReader )

            model.onprogress = console.log

            model.onerror = console.log

            // Update
            // this.files[index]

            const entries = await model.getEntries()
                .then( entries => entries.map( entry => {
                    return entry

                    // return {
                    //     filename: entry.filename,
                    //     directory: entry.directory
                    // }
                }) )
                .catch( error => {
                    console.warn('unzip Error', error)
                })

            const rootDirectory = entries[0]

            const appName = rootDirectory.filename.slice(0, -5)//'.app/'

            const machOPath = `${ appName }.app/Contents/MacOS/${ appName }`

            console.log('appName', appName)

            this.files[index].machOFile = entries.find( entry => {
                // console.log('entry', entry)
                return entry.filename.includes( machOPath )
            })

            const machOContents = await this.files[index].machOFile.getData(
                // writer
                new zip.TextWriter(),
                // options
                {
                    onprogress: (index, max) => {
                        // onprogress callback
                        console.log('Writer progress', index, max)
                    }
                }
            );
            // text contains the entry data as a String
            console.log('Mach-O contents', machOContents)

            this.files[index].status = 'scanned'

            return
        }))


        return
    }

}

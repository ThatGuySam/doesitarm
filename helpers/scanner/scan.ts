import { Buffer } from 'buffer/index.js'
import prettyBytes from 'pretty-bytes'
import * as zip from '@zip.js/zip.js'

import * as FileApi from './file-api.js'
import { isNonEmptyString, isString } from '../check-types.js'
import { extractMachoMeta } from './parsers/macho.js'
import { parsePlistBuffer } from './parsers/plist.js'

zip.configure({
    useWebWorkers: !import.meta.env.SSR
})

type MaybePromise<T> = Promise<T> | T

type ScanStatus = 'idle' | 'loading' | 'read' | 'scanning' | 'checking' | 'finished'

type FileArrayBuffer = ArrayBuffer

export interface ScanFileLike {
    arrayBuffer?: FileArrayBuffer | (() => Promise<FileArrayBuffer>)
    blob?: Blob
    buffer?: ArrayBuffer | ArrayBufferView
    mimeType?: string
    name: string
    size?: number
    type?: string
}

export interface ScanDetail {
    label: string
    value: string
}

export interface ScanArchitecture {
    bits?: unknown
    fileType?: unknown
    header?: unknown
    loadCommandsInfo?: unknown
    magic?: unknown
    offset?: unknown
    processorSubType?: unknown
    processorType?: unknown
}

export interface ScanMachoMeta {
    architectures: ScanArchitecture[]
    [ key: string ]: unknown
}

export interface ScanInfo {
    appVersion: string
    filename: string
    infoPlist: Record<string, unknown>
    machoMeta: ScanMachoMeta | null
    result: '✅' | '🔶'
}

export interface AppScanSnapshot {
    appVersion: string
    binarySize: number
    binarySupportsNative: boolean
    details: ScanDetail[]
    displayBinarySize: string
    displayName: string
    hasInfo: boolean
    hasInfoPlist: boolean
    hasMachoMeta: boolean
    info: ScanInfo
    infoPlist: Record<string, unknown>
    machoMeta: ScanMachoMeta
    status: ScanStatus
    supportedArchitectures: ScanArchitecture[]
}

export interface ScanMessage {
    data?: unknown
    error?: unknown
    message?: string
    status: ScanStatus
}

interface ScanFileEntry {
    directory?: boolean
    filename: string
    getData: ( writer: unknown ) => Promise<unknown>
    uncompressedSize: number
}

interface ScanMachoFileInstance {
    blob?: Blob
    buffer: Buffer
    name: string
    type: string
}

interface AppScanOptions {
    fileLoader: (() => MaybePromise<ArrayBuffer | Blob | ScanFileLike>) | ArrayBuffer | Blob | ScanFileLike
    messageReceiver?: ( details: ScanMessage ) => void
}

function makeNodeFileBuffer ( buffer: Uint8Array ) {
    const fileBuffer = Buffer.alloc( buffer.byteLength )

    for ( let index = 0; index < buffer.length; index += 1 ) {
        fileBuffer[ index ] = buffer[ index ]
    }

    return fileBuffer
}

function toArrayBuffer ( value: ArrayBuffer | ArrayBufferView ) {
    if ( value instanceof ArrayBuffer ) {
        return value
    }

    return value.buffer.slice(
        value.byteOffset,
        value.byteOffset + value.byteLength
    )
}

function isBlob ( value: unknown ): value is Blob {
    return typeof Blob === 'function' && value instanceof Blob
}

function firstNonEmptyString ( values: unknown[] ) {
    const match = values.find( value => isNonEmptyString( value ) )

    return typeof match === 'string' ? match : ''
}

function isPromiseLike<T> ( value: unknown ): value is PromiseLike<T> {
    return Boolean( value ) && typeof ( value as PromiseLike<T> ).then === 'function'
}

export class AppScan {
    fileLoader: AppScanOptions['fileLoader']
    messageReceiver?: ( details: ScanMessage ) => void
    status: ScanStatus
    file: ArrayBuffer | Blob | ScanFileLike | null
    bundleFileEntries: ScanFileEntry[]
    infoPlist: Record<string, unknown>
    machoExcutables: ScanFileEntry[]
    appVersion: string
    displayName: string
    details: ScanDetail[]
    bundleExecutable: ScanFileEntry | null
    displayBinarySize: string
    binarySize: number
    machoMeta: ScanMachoMeta
    binarySupportsNative: boolean
    info: ScanInfo

    constructor ( {
        fileLoader,
        messageReceiver
    }: AppScanOptions ) {
        this.fileLoader = fileLoader
        this.messageReceiver = messageReceiver

        this.status = 'idle'
        this.file = null
        this.bundleFileEntries = []
        this.infoPlist = {}
        this.machoExcutables = []

        this.appVersion = ''
        this.displayName = ''
        this.details = []
        this.bundleExecutable = null
        this.displayBinarySize = ''
        this.binarySize = 0
        this.machoMeta = {
            architectures: []
        }
        this.binarySupportsNative = false

        this.info = {
            appVersion: '',
            filename: '',
            infoPlist: {},
            machoMeta: null,
            result: '🔶'
        }
    }

    sendMessage ( details: ScanMessage ) {
        if ( details.status ) {
            this.status = details.status
        }

        if ( typeof this.messageReceiver === 'function' ) {
            this.messageReceiver( details )
        }
    }

    get hasInfoPlist () {
        return Object.keys( this.infoPlist ).length > 0
    }

    get hasMachoMeta () {
        return this.machoMeta.architectures.length > 0
    }

    get hasInfo () {
        return this.info.filename.length > 0
    }

    get bundleExecutablePath () {
        const bundleExecutable = this.infoPlist.CFBundleExecutable

        if ( !isNonEmptyString( bundleExecutable ) ) return ''

        const executablePath = String( bundleExecutable )

        if ( executablePath.includes( '/' ) ) return `/Contents/${ executablePath }`

        return `/Contents/MacOS/${ executablePath }`
    }

    get supportedArchitectures () {
        return this.machoMeta.architectures.filter( architecture => architecture.processorType !== 0 )
    }

    async readFileEntryData<T> ( fileEntry: ScanFileEntry, Writer: new () => T = zip.TextWriter as new () => T ) {
        return await fileEntry.getData(
            new Writer()
        )
    }

    async loadFile (): Promise<ArrayBuffer | Blob | ScanFileLike> {
        if ( typeof this.fileLoader !== 'function' ) {
            return this.fileLoader
        }

        const file = this.fileLoader()

        if ( file instanceof Promise || isPromiseLike( file ) ) {
            return await file as ArrayBuffer | Blob | ScanFileLike
        }

        return file
    }

    async getZipFileReader ( fileInstance: ArrayBuffer | Blob | ScanFileLike ) {
        if ( isBlob( fileInstance ) ) {
            return new zip.BlobReader( fileInstance )
        }

        if ( fileInstance instanceof ArrayBuffer ) {
            return new zip.Uint8ArrayReader( new Uint8Array( fileInstance ) )
        }

        if ( isBlob( fileInstance.blob ) ) {
            return new zip.BlobReader( fileInstance.blob )
        }

        if ( typeof fileInstance.arrayBuffer === 'function' ) {
            return new zip.Uint8ArrayReader( new Uint8Array( await fileInstance.arrayBuffer() ) )
        }

        if ( fileInstance.arrayBuffer instanceof ArrayBuffer ) {
            return new zip.Uint8ArrayReader( new Uint8Array( fileInstance.arrayBuffer ) )
        }

        if ( fileInstance.buffer instanceof ArrayBuffer ) {
            return new zip.Uint8ArrayReader( new Uint8Array( fileInstance.buffer ) )
        }

        if ( ArrayBuffer.isView( fileInstance.buffer ) ) {
            return new zip.Uint8ArrayReader( new Uint8Array( toArrayBuffer( fileInstance.buffer ) ) )
        }

        throw new Error( 'FileInstance is not a known format' )
    }

    async readFileBlob ( fileInstance: ArrayBuffer | Blob | ScanFileLike ) {
        const binaryReader = await this.getZipFileReader( fileInstance )
        const zipReader = new zip.ZipReader( binaryReader )
        const entries = await zipReader.getEntries()

        this.sendMessage({
            message: '📖 Reading file complete. Entries found',
            status: 'read'
        })

        return entries as ScanFileEntry[]
    }

    classifyBinaryEntryArchitecture ( binaryEntry: ScanMachoMeta ) {
        const armArchitecture = binaryEntry.architectures.find( architecture => {
            if ( !isString( architecture.processorType ) ) return false

            return architecture.processorType.toLowerCase().includes( 'arm' )
        } )

        return armArchitecture !== undefined
    }

    matchesMachoExecutable ( entry: ScanFileEntry ) {
        if ( entry.filename.split( '/' ).length > 4 ) return false

        return [
            'Contents/MacOS/'
        ].some( pathToMatch => {
            return entry.filename.includes( pathToMatch )
        } )
    }

    matchesRootInfoPlist ( entry: ScanFileEntry ) {
        if ( entry.filename.split( '/' ).length > 3 ) return false
        if ( entry.filename.endsWith( '/' ) ) return false
        if ( entry.filename === 'Contents/Info.plist' ) return true

        return [
            '.app/Contents/Info.plist',
            '.zip/Contents/Info.plist'
        ].some( pathToMatch => {
            return entry.filename.endsWith( pathToMatch )
        } )
    }

    fileEntryType ( fileEntry: ScanFileEntry ) {
        if ( fileEntry.directory ) return 'directory'
        if ( this.matchesMachoExecutable( fileEntry ) ) return 'machoExecutable'
        if ( this.matchesRootInfoPlist( fileEntry ) ) return 'rootInfoPlist'

        return 'unknown'
    }

    storeInfoPlist = async ( fileEntry: ScanFileEntry ) => {
        if ( this.hasInfoPlist ) {
            throw new Error( 'More than one root info.plist found' )
        }

        const infoUint8Array = await this.readFileEntryData<InstanceType<typeof zip.Uint8ArrayWriter>>( fileEntry, zip.Uint8ArrayWriter as new () => InstanceType<typeof zip.Uint8ArrayWriter> ) as Uint8Array
        const infoNodeBuffer = makeNodeFileBuffer( infoUint8Array )

        this.infoPlist = await parsePlistBuffer( infoNodeBuffer ) as Record<string, unknown>

        this.sendMessage({
            message: 'ℹ️ Found Info.plist',
            status: this.status
        })
    }

    storeMachoExecutable = ( fileEntry: ScanFileEntry ) => {
        this.machoExcutables.push( fileEntry )

        this.sendMessage({
            message: '🥊 Found a Macho executable',
            status: this.status
        })
    }

    storeResultInfo () {
        this.info = {
            appVersion: this.appVersion,
            filename: this.file && 'name' in this.file && typeof this.file.name === 'string' ? this.file.name : '',
            infoPlist: this.infoPlist,
            machoMeta: this.hasMachoMeta ? {
                ...this.machoMeta,
                architectures: this.machoMeta.architectures.map( architecture => {
                    return {
                        bits: architecture.bits,
                        fileType: architecture.fileType,
                        header: architecture.header,
                        loadCommandsInfo: architecture.loadCommandsInfo,
                        magic: architecture.magic,
                        offset: architecture.offset,
                        processorSubType: architecture.processorSubType,
                        processorType: architecture.processorType
                    }
                })
            } : null,
            result: this.binarySupportsNative ? '✅' : '🔶'
        }
    }

    storeMachoMeta = async ( fileEntry: ScanFileEntry ) => {
        if ( this.hasMachoMeta ) {
            throw new Error( 'More than one primary Macho executable found' )
        }

        if ( !this.bundleExecutable ) {
            throw new Error( 'No root bundleExecutable found' )
        }

        const bundleExecutableUint8Array = await this.readFileEntryData<InstanceType<typeof zip.Uint8ArrayWriter>>( fileEntry, zip.Uint8ArrayWriter as new () => InstanceType<typeof zip.Uint8ArrayWriter> ) as Uint8Array

        const machoFileInstance = new FileApi.File({
            buffer: Buffer.from( bundleExecutableUint8Array ),
            name: this.bundleExecutable.filename,
            type: 'application/x-mach-binary'
        }) as ScanMachoFileInstance

        machoFileInstance.blob = await this.readFileEntryData<InstanceType<typeof zip.BlobWriter>>( fileEntry, zip.BlobWriter as new () => InstanceType<typeof zip.BlobWriter> ) as Blob

        const machoMeta = await extractMachoMeta({
            FileApi,
            machoFileInstance
        }) as ScanMachoMeta | null

        if ( !machoMeta || !Array.isArray( machoMeta.architectures ) ) {
            throw new Error( 'Unable to read Mach-O metadata' )
        }

        this.machoMeta = machoMeta
    }

    targetFiles = {
        machoExecutable: {
            method: this.storeMachoExecutable
        },
        rootInfoPlist: {
            method: this.storeInfoPlist
        }
    }

    findMainExecutable () {
        const bundleExecutables = this.machoExcutables.filter( machoEntry => {
            if ( machoEntry.filename.includes( this.bundleExecutablePath ) ) {
                return true
            }

            return this.bundleExecutablePath.includes( machoEntry.filename )
        } )

        if ( bundleExecutables.length > 1 ) {
            throw new Error( 'More than one root bundleExecutable found' )
        }

        if ( bundleExecutables.length === 0 ) {
            throw new Error( 'No root bundleExecutable found' )
        }

        return bundleExecutables[ 0 ]
    }

    async findTargetFiles () {
        for ( const fileEntry of this.bundleFileEntries ) {
            const type = this.fileEntryType( fileEntry ) as keyof typeof this.targetFiles | 'directory' | 'unknown'

            if ( type in this.targetFiles ) {
                await this.targetFiles[ type as keyof typeof this.targetFiles ].method( fileEntry )
            }
        }

        this.appVersion = firstNonEmptyString( [
            this.infoPlist.CFBundleShortVersionString,
            this.infoPlist.CFBundleVersion
        ] )

        this.displayName = firstNonEmptyString( [
            this.infoPlist.CFBundleDisplayName,
            this.infoPlist.CFBundleName,
            this.infoPlist.CFBundleExecutable
        ] )

        ;([
            [ 'Version', this.infoPlist.CFBundleShortVersionString ],
            [ 'Bundle Identifier', this.infoPlist.CFBundleIdentifier ],
            [ 'File Mime Type', this.file && 'type' in this.file ? this.file.type : '' ],
            [ 'Copyright', this.infoPlist.NSHumanReadableCopyright ]
        ] as Array<[ string, unknown ]>).forEach( ( [ label, value ] ) => {
            if ( !isNonEmptyString( value ) ) return

            this.details.push({
                label,
                value: String( value )
            })
        } )

        this.bundleExecutable = this.findMainExecutable()

        this.displayBinarySize = prettyBytes( this.bundleExecutable.uncompressedSize )
        this.binarySize = this.bundleExecutable.uncompressedSize

        await this.storeMachoMeta( this.bundleExecutable )

        this.binarySupportsNative = this.classifyBinaryEntryArchitecture( this.machoMeta )
    }

    async runScan () {
        this.sendMessage({
            message: '🚛 Loading file...',
            status: 'loading'
        })

        this.file = await this.loadFile()

        this.sendMessage({
            data: this.file,
            message: '📚 Extracting from archive...',
            status: 'scanning'
        })

        this.bundleFileEntries = await this.readFileBlob( this.file )

        this.sendMessage({
            message: '🎬 Starting scan',
            status: 'scanning'
        })

        await this.findTargetFiles()

        this.storeResultInfo()

        this.sendMessage({
            message: '🔎 Checking online for native versions...',
            status: 'checking'
        })
    }

    toSnapshot (): AppScanSnapshot {
        return {
            appVersion: this.appVersion,
            binarySize: this.binarySize,
            binarySupportsNative: this.binarySupportsNative,
            details: this.details,
            displayBinarySize: this.displayBinarySize,
            displayName: this.displayName,
            hasInfo: this.hasInfo,
            hasInfoPlist: this.hasInfoPlist,
            hasMachoMeta: this.hasMachoMeta,
            info: this.info,
            infoPlist: this.infoPlist,
            machoMeta: this.machoMeta,
            status: 'finished',
            supportedArchitectures: this.supportedArchitectures
        }
    }

    async start () {
        await this.runScan()
    }
}

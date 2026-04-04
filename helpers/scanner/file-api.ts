import { EventEmitter } from 'events'

type ReadFormat = 'buffer' | 'binary' | 'dataUrl' | 'text'

type FileInput = string | Partial<NodeFile>
type NodeBuffer = ReturnType<typeof Buffer.from>

type FileReaderEventName = 'abort' | 'error' | 'load' | 'loadend' | 'loadstart' | 'progress'

interface FileReaderProgressEvent {
    lengthComputable: boolean
    loaded: number
    total?: number
}

export interface FileReaderLoadEvent {
    target: {
        nodeBufferResult: NodeBuffer
        result: NodeBuffer | string
    }
}

interface FileReaderErrorEvent {
    target: {
        error: Error
    }
}

type FileReaderEventPayload = FileReaderProgressEvent | FileReaderLoadEvent | FileReaderErrorEvent | undefined

type FileReaderListener = ( event?: FileReaderEventPayload ) => void

interface NodeFileStat {
    mtime: Date
    size: number
}

type NodeFileStream = EventEmitter

export interface NodeFile {
    blob?: Blob
    buffer?: NodeBuffer
    jsdom?: boolean
    lastModifiedDate?: Date
    name: string
    path?: string
    size?: number
    stat?: NodeFileStat
    stream?: NodeFileStream
    type?: string
}

function invokeIfFunction ( listener: unknown, args: unknown[], context: unknown ) {
    if ( typeof listener === 'function' ) {
        listener.apply( context, args )
    }
}

function toDataUrl ( data: NodeBuffer, type?: string ) {
    let dataUrl = 'data:'

    if ( type ) {
        dataUrl += `${ type };`
    }

    if ( /text/i.test( type || '' ) ) {
        dataUrl += 'charset=utf-8,'
        dataUrl += data.toString( 'utf8' )
    } else {
        dataUrl += 'base64,'
        dataUrl += data.toString( 'base64' )
    }

    return dataUrl
}

function mapDataToFormat ( file: NodeFile, data: NodeBuffer, format: ReadFormat, encoding?: BufferEncoding ) {
    switch ( format ) {
    case 'buffer':
        return data
    case 'binary':
        return data.toString( 'binary' )
    case 'dataUrl':
        return toDataUrl( data, file.type )
    case 'text':
        return data.toString( encoding || 'utf8' )
    }
}

export class File implements NodeFile {
    blob?: Blob
    buffer?: Buffer
    jsdom?: boolean
    lastModifiedDate?: Date
    name: string
    path?: string
    size?: number
    stat?: NodeFileStat
    stream?: NodeFileStream
    type?: string

    constructor ( input: FileInput ) {
        if ( typeof input === 'string' ) {
            this.path = input
        } else {
            Object.assign( this, input )
        }

        if ( !this.name ) {
            throw new Error( 'No name' )
        }

        if ( !this.path ) {
            if ( this.buffer ) {
                this.size = this.buffer.length
            } else if ( !this.stream ) {
                throw new Error( 'No input, nor stream, nor buffer.' )
            }

            return
        }

        if ( !this.jsdom ) {
            return
        }
    }
}

export class FileReader {
    readonly EMPTY = 0
    readonly LOADING = 1
    readonly DONE = 2

    error?: Error
    onabort?: FileReaderListener
    onerror?: FileReaderListener
    onload?: FileReaderListener
    onloadend?: FileReaderListener
    onloadstart?: FileReaderListener
    onprogress?: FileReaderListener
    readyState = this.EMPTY
    result?: NodeBuffer | string

    private readonly emitter = new EventEmitter()
    private file?: NodeFile
    private fileStream?: NodeFileStream
    private format?: ReadFormat
    private encoding?: BufferEncoding
    private readonly registeredEvents = new Set<FileReaderEventName>()

    nodeChunkedEncoding = false

    addEventListener ( eventName: FileReaderEventName, callback: FileReaderListener ) {
        this.emitter.on( eventName, callback )
    }

    removeEventListener ( eventName: FileReaderEventName, callback: FileReaderListener ) {
        this.emitter.removeListener( eventName, callback )
    }

    dispatchEvent ( eventName: FileReaderEventName, payload?: FileReaderEventPayload ) {
        this.emitter.emit( eventName, payload )
    }

    on ( eventName: string | symbol, listener: ( ...args: any[] ) => void ) {
        this.emitter.on( eventName, listener )
    }

    setNodeChunkedEncoding ( value: boolean ) {
        this.nodeChunkedEncoding = value
    }

    abort () {
        if ( this.readyState === this.DONE ) {
            return
        }

        this.readyState = this.DONE
        this.dispatchEvent( 'abort' )
    }

    readAsArrayBuffer ( file: NodeFile ) {
        this.readFile( file, 'buffer' )
    }

    readAsBinaryString ( file: NodeFile ) {
        this.readFile( file, 'binary' )
    }

    readAsDataURL ( file: NodeFile ) {
        this.readFile( file, 'dataUrl' )
    }

    readAsText ( file: NodeFile, encoding?: BufferEncoding ) {
        this.readFile( file, 'text', encoding )
    }

    private createFileStream () {
        if ( this.file?.stream ) {
            this.fileStream = this.file.stream
            return
        }

        if ( this.file?.buffer ) {
            const stream = new EventEmitter() as NodeFileStream

            process.nextTick( () => {
                stream.emit( 'data', this.file!.buffer! )
                stream.emit( 'end' )
            } )

            this.file!.stream = stream
            this.fileStream = stream
        }
    }

    private registerUserEvents () {
        if ( this.registeredEvents.size > 0 ) {
            return
        }

        const userEvents: Array<[ FileReaderEventName, 'onloadstart' | 'onprogress' | 'onload' | 'onloadend' | 'onabort' ]> = [
            [ 'loadstart', 'onloadstart' ],
            [ 'progress', 'onprogress' ],
            [ 'load', 'onload' ],
            [ 'loadend', 'onloadend' ],
            [ 'abort', 'onabort' ]
        ]

        for ( const [ eventName, propertyName ] of userEvents ) {
            this.emitter.on( eventName, ( event?: FileReaderEventPayload ) => {
                invokeIfFunction( this[ propertyName ], [ event ], this )
            } )
            this.registeredEvents.add( eventName )
        }

        this.emitter.on( 'error', ( event?: FileReaderEventPayload ) => {
            if ( typeof this.onerror === 'function' ) {
                this.onerror( event )
                return
            }

            const error = ( event as FileReaderErrorEvent | undefined )?.target.error

            if ( error && this.emitter.listenerCount( 'error' ) <= 1 ) {
                throw error
            }
        } )
        this.registeredEvents.add( 'error' )
    }

    private mapStreamToEmitter () {
        const stream = this.fileStream

        if ( !stream || !this.file || !this.format ) {
            return
        }

        const buffers: NodeBuffer[] = []
        let dataLength = 0

        stream.on( 'error', ( error: Error ) => {
            if ( this.readyState === this.DONE ) {
                return
            }

            this.readyState = this.DONE
            this.error = error
            this.dispatchEvent( 'error', {
                target: {
                    error
                }
            } )
        } )

        stream.on( 'data', ( data: NodeBuffer ) => {
            if ( this.readyState === this.DONE ) {
                return
            }

            dataLength += data.length
            buffers.push( data )

            this.dispatchEvent( 'progress', {
                lengthComputable: !Number.isNaN( this.file?.size ),
                loaded: dataLength,
                total: this.file?.size
            } )
        } )

        stream.on( 'end', () => {
            if ( this.readyState === this.DONE ) {
                return
            }

            const data = buffers.length > 1
                ? Buffer.concat( buffers as unknown as readonly Uint8Array[] ) as NodeBuffer
                : ( buffers[ 0 ] || Buffer.alloc( 0 ) )

            this.readyState = this.DONE
            this.result = mapDataToFormat( this.file!, data, this.format!, this.encoding )

            const event = {
                target: {
                    nodeBufferResult: data,
                    result: this.result
                }
            }

            this.dispatchEvent( 'load', event )
            this.dispatchEvent( 'loadend', event )
        } )
    }

    private readFile ( file: NodeFile, format: ReadFormat, encoding?: BufferEncoding ) {
        this.file = file
        this.format = format
        this.encoding = encoding

        if ( !this.file || !this.file.name || !( this.file.path || this.file.stream || this.file.buffer ) ) {
            throw new Error( `cannot read as File: ${ JSON.stringify( this.file ).slice( 0, 1000 ) }` )
        }

        if ( this.readyState !== this.EMPTY ) {
            console.log( 'already loading, request to change format ignored' )
            return
        }

        process.nextTick( () => {
            this.readyState = this.LOADING
            this.dispatchEvent( 'loadstart' )
            this.createFileStream()
            this.mapStreamToEmitter()
            this.registerUserEvents()
        } )
    }
}

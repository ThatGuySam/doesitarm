import AppScanWorker from './worker?worker'

import type {
    AppScanSnapshot,
    ScanFileLike,
    ScanMessage
} from './scan'

const noop = () => {}

type ScanMessageReceiver = ( details: ScanMessage ) => void

interface WorkerScanFile extends ScanFileLike {
    arrayBuffer: ArrayBuffer
}

interface WorkerFinishedMessage extends ScanMessage {
    error?: {
        message?: string
    }
    scan?: AppScanSnapshot
    status: 'finished'
}

function toArrayBuffer ( value: ArrayBuffer | ArrayBufferView ) {
    if ( value instanceof ArrayBuffer ) {
        return value
    }

    return new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength
    ).slice().buffer
}

function isWorkerFinishedMessage ( details: ScanMessage | WorkerFinishedMessage ): details is WorkerFinishedMessage {
    return details.status === 'finished'
}

async function getArrayBufferFromFileData ( file: ScanFileLike ) {
    if ( typeof file.arrayBuffer === 'function' ) {
        return await file.arrayBuffer()
    }

    if ( file.arrayBuffer instanceof ArrayBuffer ) {
        return file.arrayBuffer
    }

    if ( file.buffer instanceof ArrayBuffer ) {
        return file.buffer
    }

    if ( ArrayBuffer.isView( file.buffer ) ) {
        return toArrayBuffer( file.buffer )
    }

    throw new Error( 'No fileArrayBuffer' )
}

function makeWorkerFile ( file: ScanFileLike, arrayBuffer: ArrayBuffer ): WorkerScanFile {
    return {
        arrayBuffer,
        name: file.name,
        size: file.size ?? arrayBuffer.byteLength,
        type: file.type ?? file.mimeType ?? ''
    }
}

export async function runScanWorker (
    file: ScanFileLike,
    messageReceiver: ScanMessageReceiver = noop
) {
    const AppScanWorkerConstructor = AppScanWorker as unknown as { new (): Worker }
    const appScanWorker = new AppScanWorkerConstructor()
    const fileArrayBuffer = await getArrayBufferFromFileData( file )
    const workerFile = makeWorkerFile( file, fileArrayBuffer )

    const scan = await new Promise<AppScanSnapshot>( ( resolve, reject ) => {
        const cleanup = () => {
            appScanWorker.onmessage = null
            appScanWorker.onerror = null
            appScanWorker.terminate()
        }

        appScanWorker.onmessage = ( event: MessageEvent<ScanMessage | WorkerFinishedMessage> ) => {
            const details = event.data

            messageReceiver( details )

            if ( !isWorkerFinishedMessage( details ) ) {
                return
            }

            cleanup()

            if ( details.scan ) {
                resolve( details.scan )
                return
            }

            reject( new Error( details.error?.message || details.message || 'Worker finished without a scan result.' ) )
        }

        appScanWorker.onerror = ( errorEvent: ErrorEvent ) => {
            cleanup()
            reject( new Error( errorEvent.message || 'Error received from App Scan Worker' ) )
        }

        appScanWorker.postMessage( {
            status: 'start',
            options: {
                file: workerFile
            }
        }, [
            fileArrayBuffer
        ] )
    } )

    return {
        appScanWorker,
        scan
    }
}

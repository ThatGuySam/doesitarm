/// <reference lib="webworker" />

import {
    AppScan,
    type AppScanSnapshot,
    type ScanFileLike,
    type ScanMessage
} from './scan'

type WorkerRequest =
    | {
        options: {
            file: ScanFileLike
        }
        status: 'start'
    }
    | {
        status: string
    }

type WorkerResponse =
    | ScanMessage
    | {
        error?: {
            message?: string
        }
        message?: string
        scan?: AppScanSnapshot
        status: 'finished'
    }

const workerScope = self as unknown as DedicatedWorkerGlobalScope

function isStartRequest ( request: WorkerRequest ): request is Extract<WorkerRequest, { status: 'start' }> {
    return request.status === 'start'
}

workerScope.onmessage = async ( event: MessageEvent<WorkerRequest> ) => {
    if ( !isStartRequest( event.data ) ) {
        workerScope.postMessage( {
            status: 'finished'
        } satisfies WorkerResponse )
        return
    }

    const { options } = event.data
    const scan = new AppScan({
        fileLoader: options.file,
        messageReceiver: ( details ) => {
            workerScope.postMessage( details satisfies WorkerResponse )
        }
    })

    try {
        await scan.start()

        workerScope.postMessage( {
            scan: scan.toSnapshot(),
            status: 'finished'
        } satisfies WorkerResponse )
    } catch ( error ) {
        const message = error instanceof Error ? error.message : String( error )

        workerScope.postMessage( {
            error: {
                message
            },
            message: `🚫 Error: ${ message }`,
            status: 'finished'
        } satisfies WorkerResponse )
    }
}

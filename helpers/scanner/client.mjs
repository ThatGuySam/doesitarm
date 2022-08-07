import AppScanWorker from './worker.mjs?worker'

const noop = () => {}

export async function runScanWorker ( file, messageReceiver = noop ) {
    // console.log( 'file', file )

    const appScanWorker = new AppScanWorker()

    const fileArrayBuffer = ( typeof file.arrayBuffer === 'function' ) ? (await file.arrayBuffer()) : file.arrayBuffer

    const scan = await new Promise( ( resolve, reject ) => {
        // Set up the worker message handler
        appScanWorker.onmessage = async (event) => {
            // console.log( 'Main received message', event )

            const { status, message } = event.data

            messageReceiver({ status, message })

            // Resolves promise on finished status
            if ( status === 'finished' ) {
                const { scan } = event.data
                resolve( scan )
            }
        }

        // Set up the worker error handler
        appScanWorker.onerror = async ( errorEvent ) => {
            console.error( 'Error received from App Scan Worker', errorEvent )
            reject()
        }


        // Start the worker
        // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
        appScanWorker.postMessage( {
            status: 'start',
            options: {
                file: {
                    ...file,
                    // We put it into an array
                    // so that it's iterable for Blob
                    arrayBuffer: [ fileArrayBuffer ]
                }
            }
        }, [
            // This array is our transferrable objects
            // so that the App Scan Worker is allowed
            // to use existing data from the main thread
            // and we don't have to clone the data from scratch
            fileArrayBuffer
        ] )
    })

    return {
        scan,
        appScanWorker
    }
}

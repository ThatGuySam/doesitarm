import AppScanWorker from '~/helpers/scanner/worker.js?worker'

export async function runScanWorker ( file ) {
    // console.log( 'file', file )

    const appScanWorker = new AppScanWorker()

    const scan = await new Promise( ( resolve, reject ) => {
        // Set up the worker message handler
        appScanWorker.onmessage = async (event) => {
            // console.log( 'Main received message', event )

            const { status } = event.data

            // Resolves promise on finished status
            if ( status === 'finished' ) {
                const { scan } = event.data
                resolve( scan )
            }
        }

        // Set up the worker error handler
        appScanWorker.onerror = async ( errorEvent ) => {
            // console.log( 'appScanWorker.onerror', errorEvent )
            reject()
        }

        // Start the worker
        // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
        appScanWorker.postMessage( {
            status: 'start',
            options: {
                fileLoader: () => ({
                    ...file,
                    arrayBuffer: file.arrayBuffer
                }),
                messageReceiver: ( details ) => {
                    console.log( 'Scan message:', details )
                }
            }
        }, [ file.arrayBuffer ] )
    })

    return {
        scan,
        appScanWorker
    }
}

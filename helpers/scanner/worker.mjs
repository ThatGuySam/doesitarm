import { AppScan } from './scan.mjs'

self.onmessage = async ( event ) => {

    console.log( 'Worker received message', event )

    const { status } = event.data

    // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
    // self.postMessage( event )


    if ( status === 'start' ) {
        // Get Scan Options
        const { options } = event.data

        // console.log( 'options', options )

        const scan = new AppScan({
            fileLoader: () => options.file,
            // Use self.postMessage as the message callback
            messageReceiver: ( message ) => {
                self.postMessage( message )
            }
        })

        await scan.start()


        self.postMessage( {
            status: 'finished',
            // Convert App Scan instance to a more primitive Object
            // so that it's clonneable for our worker
            scan: JSON.parse(JSON.stringify( scan ))
        })

        return
    }


    self.postMessage( { status: 'finished' } )
    return
}

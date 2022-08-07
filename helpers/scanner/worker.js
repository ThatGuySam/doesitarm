import { AppScan } from '~/helpers/scanner/client.mjs'

self.onmessage = async ( event, transferrable ) => {

    console.log( 'Worker received message', event, transferrable )

    const { status } = event.data

    // https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
    // self.postMessage( event )


    if ( status === 'start' ) {
        // Get Scan Options
        const { options } = event.data
        // console.log( 'options', options )
        const scan = new AppScan({
            ...options,
            // Use self.postMessage as the message callback
            messageReceiver: ( message ) => {
                self.postMessage( message )
            }
        })

        await scan.start()


        self.postMessage( {
            status: 'finished', 
            scan
        })

        return
    }


    self.postMessage( { status: 'finished' } )
    return
}

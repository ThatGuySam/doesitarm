import { mswServer } from '~/test/msw/server.js'


const mswEnabled = process.env.NODE_ENV && [ 'development', 'test' ].includes( process.env.NODE_ENV )

// Inspired by https://github.com/wwdrew/examples/blob/react-native/examples/react-native/index.js
if ( mswEnabled ) {
    // const { native } = require( '~/test/msw/native' )
    // const { mswServer } = await import( '~/test/msw/server' )

    // console.log({ mswServer })

    mswServer.listen( {
        // Fixes issue with MSW capturing POST http://192.168.1.90:19000/symbolicate
        onUnhandledRequest: 'bypass',
    } )
}
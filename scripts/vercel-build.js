import { execSync } from 'child_process' // The exec import

;(async () => {
    // scan-new-apps test-prebuild build-lists-and-api test-postbuild-api
    const steps = [
        'scan-new-apps',
        'test-prebuild',
        'build-lists-and-api',
        'test-postbuild-api'
    ]

    for ( const stepScriptName of steps ) {
        console.log( `Running step: ${ stepScriptName }` )

        execSync( `npm run ${ stepScriptName }`, { stdio: 'inherit' } )
    }


    process.exit()
})()

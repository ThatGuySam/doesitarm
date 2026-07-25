async function main () {
    const hostArgument = process.argv.find( argument => argument.startsWith( '--host=' ) )
    const host = hostArgument
        ? hostArgument.slice( '--host='.length ).replace( /\/$/, '' )
        : 'https://doesitarm.com'
    const endpoint = `${ host }/api/subscriptions`
    const healthEndpoint = `${ endpoint }/health`

    const healthResponse = await fetch( healthEndpoint )
    const healthBody = await healthResponse.json()

    if (
        healthResponse.status !== 200 ||
        healthBody.ok !== true ||
        healthBody.service !== 'doesitarm-subscriptions'
    ) {
        throw new Error(
            `Subscription health check failed with ${ healthResponse.status }.`
        )
    }

    const optionsResponse = await fetch( endpoint, {
        headers: {
            'Origin': 'https://doesitarm.com'
        },
        method: 'OPTIONS'
    } )

    if (
        optionsResponse.status !== 204 ||
        optionsResponse.headers.get( 'Access-Control-Allow-Origin' ) !==
            'https://doesitarm.com'
    ) {
        throw new Error(
            `Subscription CORS check failed with ${ optionsResponse.status }.`
        )
    }

    console.log( `Subscription Worker verification passed for ${ host }` )
}

main().catch( error => {
    console.error( error instanceof Error ? error.message : error )
    process.exitCode = 1
} )


export class StorkClient {
    constructor ( options = {} ) {

        this.name = options.name
        this.url = options.url
        this.config = options.config

        // Stork instance
        this.stork = options.stork

    }

    setupState = 'not-setup'

    get isSetup () {
        return this.setupState === 'complete'
    }

    search ( query ) {
        if ( !this.isSetup ) throw new Error('Not setup')

        return this.stork.search( this.name, query )
    }

    // Loads the Stork WASM and Index into the browser on first query
    // so that we don't have to load them initially.
    async lazyQuery ( query ) {
        if ( !this.isSetup ) await this.setup()

        return this.search( query )
    }

    waitForSetup () {
        return new Promise( resolve => {
            if ( this.isSetup ) resolve()

            // Start timer to check for setup
            const timer = setInterval( () => {
                if ( this.isSetup ) {
                    clearInterval( timer )
                    resolve()
                }
            }, 50 )
        })
    }

    // https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L40
    async setup () {
        // Prevent multiple setups
        if ( this.setupState !== 'not-setup' ) {
            await waitForSetup()
            return
        }

        const {
            initialize,
            downloadIndex,
        } = this.stork

        const initPromise = initialize()
        const downloadPromise = downloadIndex( this.name, this.url, this.config )

        // This silly `then` call turns a [(void), (void)] into a (void), which is
        // only necessary to make Typescript happy.
        // You begin to wonder if you write Typescript code, or if Typescript code writes you.
        await Promise.all([initPromise, downloadPromise])

        // Mark setup as complete
        this.setupState = 'complete'

        return
    }
}

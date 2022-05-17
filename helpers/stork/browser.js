
import {
    storkIndexRelativeURL,
    storkScriptURL
} from '~/helpers/stork/config.js'

export class StorkClient {
    constructor ( options = {} ) {

        this.name = options.name || 'index'
        this.url = options.url || storkIndexRelativeURL

        // Configuration Reference - https://stork-search.net/docs/js-ref#showProgress
        // Example - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/config.ts#L4
        this.config = {
            minimumQueryLength: 1,
            showScores: true,
            ...options.config || {}
        }

        // Stork instance
        this.stork = options.stork || null
    }

    setupState = 'not-setup'

    get isSetup () {
        return this.setupState === 'complete'
    }

    search ( query ) {
        if ( !this.isSetup ) throw new Error('Not setup')

        // search() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L55
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

    loadStorkScript () {

        return new Promise((resolve, reject) => {
            if ( !!this.stork ) resolve()

            if ( !!window.stork ) {
                this.stork = window.stork
                resolve()
            }

            const s = document.createElement('script')
            let r = false
            s.type = 'text/javascript'
            s.src = storkScriptURL
            s.async = true
            s.onerror = function(err) {
                reject(err, s)
            }

            s.onload = s.onreadystatechange = () => {
                // console.log(this.readyState); // uncomment this line to see which ready states are called.
                if (!r && (!this.readyState || this.readyState == 'complete')) {
                    r = true

                    this.stork = window.stork

                    // console.log('window.stork', typeof window.stork)
                    resolve()
                }
            }

            const t = document.getElementsByTagName('script')[0]
            t.parentElement.insertBefore(s, t)
        })
    }

    // https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L40
    async setup () {
        // Prevent multiple setups
        if ( this.setupState !== 'not-setup' ) {
            await this.waitForSetup()
            return
        }

        // We're the first to setup
        // so let's set the state to prevent duplicates
        this.setupState = 'pending'

        // Load Stork Script
        if ( !this.stork ) {
            // console.log('Loading stork script...')
            await this.loadStorkScript()
        }

        const {
            initialize,
            downloadIndex,
        } = this.stork

        // Stork JavaScript Reference - https://stork-search.net/docs/js-ref

        // initialize() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L14
        const initPromise = initialize()

        // downloadIndex() - https://github.com/jameslittle230/stork/blob/ff49f163db06734e18ab690c188b45a3c68442ae/js/main.ts#L20
        const downloadPromise = downloadIndex( this.name, this.url, this.config )

        // This silly `then` call turns a [(void), (void)] into a (void), which is
        // only necessary to make Typescript happy.
        // You begin to wonder if you write Typescript code, or if Typescript code writes you.
        await Promise.all([ initPromise, downloadPromise ])

        // Mark setup as complete
        this.setupState = 'complete'

        return
    }
}

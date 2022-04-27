

import {
    getAppType
} from './app-derived.js'


export class ListingDetails {
    constructor ( listing ) {
        this.listing = listing

        this.type = getAppType( listing )
    }

    type = ''

    get mainHeading () {
        if ( this.type === 'formula' ) {
            return `Does <code>${ this.listing.name }</code> work on Apple Silicon when installed via Homebrew?`
        }

        return `Does ${ this.listing.name } work on Apple Silicon?`
    }

    get subtitle () {
        return this.listing.text
    }

    buildListingDetails ( listing ) {

    }
}

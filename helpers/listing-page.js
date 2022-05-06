

import {
    getAppType
} from './app-derived.js'
import { buildVideoStructuredData } from './structured-data.js'
import { nuxtHead } from './config.js'
import {
    getPartPartsFromUrl
} from './url.js'


export const samChannelId = 'UCB3jOb5QVjX7lYecvyCoTqQ'

function makeTitle ( listing ) {
    return `Does ${ listing.name } work on Apple Silicon? - ${ nuxtHead.title }`
}

function makeDescription ( listing ) {
    return `Latest reported support status of ${ listing.name } on Apple Silicon and Apple M1 Pro and M1 Max Processors.`
}
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

    get pageTitle () {
        return makeTitle( this.listing )
    }

    get pageDescription () {
        return makeDescription( this.listing )
    }

    get endpointParts () {
        return getPartPartsFromUrl( this.listing.endpoint )
    }

    get hasRelatedVideos () {
        return Array.isArray( this.listing.relatedVideos ) && this.listing.relatedVideos.length > 0
    }

    get hasRelatedApps () {
        return false
    }

    get hasBenchmarksPage () {
        return this.hasRelatedVideos
    }

    get shouldHaveSubscribeButton () {
        if ( this.initialVideo === null ) return false

        return this.initialVideo.channel.id !== samChannelId
    }

    get initialVideo () {
        if ( this.type === 'video' ) {
            return this.listing.video
        }

        if ( this.hasRelatedVideos ) {
            return this.listing.relatedVideos[0]
        }

        return null
    }

    get structuredData () {
        if ( this.type === 'video' ) {
            return buildVideoStructuredData( this.listing, this.listing.featuredApps, { siteUrl: import.meta.site } )
        }

        return null
    }

    get headOptions () {
        return {
            title: this.pageTitle,
            description: this.pageDescription,
            // meta,
            // link,
            structuredData: this.structuredData,

            // domain,
            pathname: this.listing.endpoint,
        }
    }
}

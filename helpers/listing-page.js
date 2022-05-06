

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

export function getVideoImages ( video ) {
    const webpSource = {
        ...video.thumbnail,
        srcset: video.thumbnail.srcset.replaceAll('ytimg.com/vi/', 'ytimg.com/vi_webp/').replace(/.png|.jpg|.jpeg/g, '.webp')
    }

    return {
        src: video.thumbnail.src,
        srcset: {
            webp: webpSource,
            jpeg: video.thumbnail
        }
    }
}

export function makeApiPathFromEndpoint ( endpoint ) {
    const [
        kind,
        listingSlug
    ] = getPartPartsFromUrl( endpoint )

    return `/api/${ kind }/${ listingSlug }.json`
}
export class ListingDetails {
    constructor ( listing ) {
        this.api = listing

        this.type = getAppType( listing )
    }

    type = ''

    get mainHeading () {
        if ( this.type === 'formula' ) {
            return `Does <code>${ this.api.name }</code> work on Apple Silicon when installed via Homebrew?`
        }

        return `Does ${ this.api.name } work on Apple Silicon?`
    }

    get subtitle () {
        return this.api.text
    }

    get pageTitle () {
        return makeTitle( this.api )
    }

    get pageDescription () {
        return makeDescription( this.api )
    }

    get endpointParts () {
        return getPartPartsFromUrl( this.api.endpoint )
    }

    get apiEndpointPath () {
        return makeApiPathFromEndpoint( this.api.endpoint )
    }

    get hasRelatedVideos () {
        return Array.isArray( this.api.relatedVideos ) && this.api.relatedVideos.length > 0
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
            return this.api.video
        }

        if ( this.hasRelatedVideos ) {
            return this.api.relatedVideos[0]
        }

        return null
    }

    get videoPosterSources () {
        if ( this.initialVideo === null ) return null

        return getVideoPosterSources( this.initialVideo )
    }

    get structuredData () {
        if ( this.type === 'video' ) {
            return buildVideoStructuredData( this.api, this.api.featuredApps, { siteUrl: import.meta.site } )
        }

        return null
    }

    get headOptions () {
        return {
            title: this.pageTitle,
            description: this.pageDescription,
            // meta,
            link: [],
            structuredData: this.structuredData,

            // domain,
            pathname: this.api.endpoint,
        }
    }
}

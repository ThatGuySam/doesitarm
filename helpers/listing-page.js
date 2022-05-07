
import has from 'just-has'

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

    // Catch the case where the video has no thumbnails
    if ( !has( video, 'thumbnail' ) ) throw new Error('No thumbnail found')

    const convertYoutubeImageUrl = ( stringWithUrls, extension ) => stringWithUrls.replaceAll('ytimg.com/vi/', `ytimg.com/vi_${ extension }/`).replace(/.png|.jpg|.jpeg/g, `.${ extension }`)

    const webpSource = {
        ...video.thumbnail,
        srcset: convertYoutubeImageUrl( video.thumbnail.srcset, 'webp' ),
        src: convertYoutubeImageUrl( video.thumbnail.src, 'webp' ),
        type: 'image/webp'
    }

    const jpgSource = {
        ...video.thumbnail,
        type: 'image/jpeg'
    }

    const sources = {
        webp: webpSource,
        jpeg: jpgSource
    }

    // Responsive Preloads
    // https://blog.laurenashpole.com/post/658079409151016960/preloading-images-in-a-responsive-webp-world
    // <link rel="preload" as="image" href="large-image.webp" media="(min-width: 768px)" imagesrcset="large-image.webp, large-image-2x.webp 2x" type="image/webp" />
    const preloads = Object.entries( sources ).map( ([ typeKey, typeSource ]) => {
        return {
            'rel': 'preload',
            'as': 'image',
            'href': typeSource.src,
            'media': typeSource.sizes,
            'imagesrcset': typeSource.srcset,
            'type': typeSource.type
        }
    })

    return {
        imgSrc: video.thumbnail.src,
        sources,
        preloads
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

    get hasInitialVideo () {
        return this.initialVideo !== null
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

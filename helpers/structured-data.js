import { getSiteUrl } from './url'

function makeFeaturedAppsString ( featuredApps ) {
    return featuredApps.slice(0, 5).map(app => app.name).join(', ')
}

export function buildVideoStructuredData ( video, featuredApps, options = {} ) {
    // console.log('video', video)

    // Throw for missing featured apps
    if ( Array.isArray(featuredApps) === false ) {
        console.warn( 'featuredApps not array', featuredApps )
        throw new Error('featuredApps must be an array of objects')
    }

    const {
        siteUrl = getSiteUrl(),
    } = options

    const thumbnailUrls = video.thumbnail.srcset.split(',').map( srcSetImage => {
        const [ imageUrl ] = srcSetImage.trim().split(' ')

        return imageUrl
    })

    const featuredAppsString = makeFeaturedAppsString( featuredApps )

    const embedUrl = new URL( `${ siteUrl }/embed/rich-results-player` )

    embedUrl.searchParams.append( 'youtube-id', video.id )
    embedUrl.searchParams.append( 'name', video.name )

    return {
        "@context": "https://schema.org",
        // https://developers.google.com/search/docs/data-types/video
        // https://schema.org/VideoObject
        "@type": "VideoObject",
        "name": video.name,
        "description": `Includes the following apps: ${featuredAppsString}`,
        "thumbnailUrl": thumbnailUrls,
        // https://en.wikipedia.org/wiki/ISO_8601
        "uploadDate": video.lastUpdated.raw,
        // "duration": "PT1M54S", // Need to updaet Youtube API Request for this
        // "contentUrl": "https://www.example.com/video/123/file.mp4",
        "embedUrl": embedUrl.href,
        // "interactionStatistic": {
        //     "@type": "InteractionCounter",
        //     "interactionType": { "@type": "http://schema.org/WatchAction" },
        //     "userInteractionCount": 5647018
        // },
        // "regionsAllowed": "US,NL"
    }
}

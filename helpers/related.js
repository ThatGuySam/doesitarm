// import { allVideoAppsListSet } from '~/helpers/get-list.js'
// import videoList from '~/static/video-list.json'

import { getAppEndpoint, getAppType } from '~/helpers/app-derived.js'

function videoHasAppEndpoint ( video, appEndpoint ) {
    for (const appLink of video.appLinks) {
        if ( appLink.endpoint === appEndpoint ) {
            return true
        }
    }

    return false
}

export function appsRelatedToVideo ( video, allVideoAppsListSet ) {

    const relatedApps = []

    // Find the apps listed in this video
    for (const app of allVideoAppsListSet) {
        // console.log('video', video)
        // Skip this app if it's not listed in the videos apps
        if (!videoHasAppEndpoint( video, app.endpoint )) continue

        // Add this app to our featured app list
        relatedApps.push(app)
    }

    return relatedApps
}

export function videosRelatedToVideo ( video, allVideoAppsListSet, videoListSet ) {
    const relatedVideos = {}

    const featuredApps = appsRelatedToVideo( video, allVideoAppsListSet )

    // Find other videos that also feature this video's app
    for (const otherVideo of videoListSet) {
        for (const app of featuredApps) {
            // console.log('otherVideo', otherVideo)
            // Skip if this app is not in the other video's apps
            if (!videoHasAppEndpoint( otherVideo, app.endpoint )) continue

            // Skip if the other video is, in fact, this video
            if (otherVideo.slug === video.slug) continue

            // Add this video to our related videos list
            relatedVideos[otherVideo.id] = otherVideo
        }
    }

    return Object.values(relatedVideos)
}


export function videosRelatedToApp ( app, videoListSet ) {

    // console.log('videoListSet', videoListSet)

    const relatedVideos = []

    // Find other videos that also feature this video's app
    for (const video of videoListSet) {

        if (!videoHasAppEndpoint( video, app.endpoint )) continue

        relatedVideos.push( video )

        if ( relatedVideos.length > 20 ) break
    }

    return relatedVideos
}

export function videoBenchmarksRelatedToApp ( app, videoListSet ) {
    return videosRelatedToApp( app, videoListSet ).map(video => {
        return {
            ...video,
            endpoint: `${getAppEndpoint( app )}/benchmarks#${video.id}`
        }
    })
}


export function getRelatedVideos ( { listing, videoListSet, appListSet } = {} ) {
    const listingType = getAppType( listing )

    if ( listingType === 'video' ) {
        return videosRelatedToVideo( listing, appListSet, videoListSet )
    }

    return videoBenchmarksRelatedToApp( listing, videoListSet )
}


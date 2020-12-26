import { allVideoAppsList } from '~/helpers/get-list.js'
import videoList from '~/static/video-list.json'

export function matchesWholeWord (needle, haystack) {
    return new RegExp('\\b' + needle + '\\b').test(haystack)
}

export function appsRelatedToVideo ( video ) {
    const relatedApps = []

    // Find the apps listed in this video
    for (const app of allVideoAppsList) {
        // Skip this app if it's not listed in the videos apps
        if (!video.apps.includes(app.slug)) continue

        // Add this app to our featured app list
        relatedApps.push(app)
    }

    return relatedApps
}

export function videosRelatedToVideo ( video ) {
    const relatedVideos = []

    const featuredApps = appsRelatedToVideo( video )

    // Find other videos that also feature this video's app
    for (const otherVideo of videoList) {
        for (const app of featuredApps) {
            // Skip if this app is not in the other video's apps
            if (!otherVideo.apps.includes(app.slug)) continue

            // Skip if the other video is, in fact, this video
            if (otherVideo.slug === video.slug) continue

            // Add this video to our related videos list
            relatedVideos.push(otherVideo)
        }
    }

    return relatedVideos
}


export function videosRelatedToApp ( app ) {
    const relatedVideos = []

    // Find other videos that also feature this video's app
    for (const video of videoList) {
        if (!video.apps.includes(app.slug)) continue

        relatedVideos.push(video)
    }

    return relatedVideos
}

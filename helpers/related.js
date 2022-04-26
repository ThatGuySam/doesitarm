// import { allVideoAppsListSet } from '~/helpers/get-list.js'
// import videoList from '~/static/video-list.json'

export function appsRelatedToVideo ( video, allVideoAppsListSet ) {
    // console.log('allVideoAppsListSet', allVideoAppsListSet.length)

    const relatedApps = []

    // Find the apps listed in this video
    for (const app of allVideoAppsListSet) {
        // console.log('video', video)
        // Skip this app if it's not listed in the videos apps
        if (!video.apps.includes(app.slug)) continue

        // Add this app to our featured app list
        relatedApps.push(app)
    }

    return relatedApps
}

export function videosRelatedToVideo ( video, allVideoAppsListSet, videoListSet ) {
    const relatedVideos = {}

    // console.log('videoList', videoList[0])
    // console.log('allVideoAppsListSet', allVideoAppsListSet[0])

    const featuredApps = appsRelatedToVideo( video, allVideoAppsListSet )

    // Find other videos that also feature this video's app
    for (const otherVideo of videoListSet) {
        for (const app of featuredApps) {
            // console.log('otherVideo', otherVideo)
            // Skip if this app is not in the other video's apps
            if (!otherVideo.apps.includes(app.slug)) continue

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
        if (!video.apps.includes(app.slug)) continue

        relatedVideos.push( video )

        if ( relatedVideos.length > 20 ) break
    }

    return relatedVideos
}

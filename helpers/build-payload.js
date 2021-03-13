

import { appsRelatedToVideo, videosRelatedToVideo, videosRelatedToApp } from './related.js'
// import videoList from '~/static/video-list.json'


export function buildVideoPayload ( video, allVideoAppsListSet, videoListSet ) {
    // const { appsRelatedToVideo, videosRelatedToVideo } = await import('~/helpers/related.js')
    // const { default: videoList } = await import('~/static/video-list.json')

    // Find the video for our current page
    // const video = videoList.find(video => (video.slug === slug))

    // Get featured apps
    const featuredApps = appsRelatedToVideo( video, allVideoAppsListSet )

    // Get related videos
    const relatedVideos = videosRelatedToVideo( video, allVideoAppsListSet, videoListSet )

    return {
        video,
        featuredApps,
        // If no related video found just get the 12 newest ones
        relatedVideos: (relatedVideos.length !== 0) ? relatedVideos.slice(0, 24) : Array.from(videoListSet).slice(0, 12)
    }
}


export function buildAppBenchmarkPayload ( app, allVideoAppsListSet, videoListSet ) {
    // const { allVideoAppsListSet } = await import('~/helpers/get-list.js')

    // const { videosRelatedToApp } = await import('~/helpers/related.js')

    // const app = allVideoAppsListSet.find(app => (app.slug === slug))

    const submitVideoCard = {
        endpoint: `https://docs.google.com/forms/d/e/1FAIpQLSeEVGM9vE7VcfLMy6fJkfU70X2VZ60rHDyhDQLtnAN4nso0WA/viewform?usp=pp_url&entry.1018125313=${app.name}`
    }

    // const featuredApps = []

    const relatedVideos = videosRelatedToApp( app, videoListSet ).map(video => {
        // console.log('video', video)
        return {
            ...video,
            // endpoint: `#${video.id}`
        }
    })

    return {
        app,
        allVideos: relatedVideos,
        submitVideoCard
    }
}

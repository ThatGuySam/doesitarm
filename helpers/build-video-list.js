
import slugify from 'slugify'
import axios from 'axios'



const videoFeaturesApp = function (app, video) {
    const appFuzzyName = app.name.toLowerCase()
    if (video.title.toLowerCase().includes(appFuzzyName)) return true

    const appIsInTimestamps = video.timestamps.map( timestamp => timestamp.fullText.toLowerCase()).includes(appFuzzyName)

    if (appIsInTimestamps) return true

    if (video.description.toLowerCase().includes(appFuzzyName)) return true

    return false
}

export default async function ( applist ) {

    // Fetch Commits
    const response = await axios.get(process.env.VIDEO_SOURCE)
    // Extract commit from response data
    const fetchedVideos = response.data
    // console.log('commits', commits)

    const videos = []

    for (const videoId in fetchedVideos) {
        // Build video slug
        const slug = slugify(`${fetchedVideos[videoId].title}-i-${videoId}`, {
            lower: true,
            strict: true
        })

        const apps = []

        for ( const app of applist ) {
            if (videoFeaturesApp(app, fetchedVideos[videoId])) {
                apps.push(app.slug)
            }
        }

        videos.push({
            apps,
            slug,
            timestamps: fetchedVideos[videoId].timestamps,
            endpoint: `/tv/${slug}`
        })
    }

    return videos
}

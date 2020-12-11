
import slugify from 'slugify'
import axios from 'axios'

import { byTimeThenNull } from './sort-list.js'
import parseGithubDate from './parse-github-date'

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

    // console.log('fetchedVideos', fetchedVideos)

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

        // console.log('fetchedVideos[videoId].rawData.snippet', fetchedVideos[videoId].rawData.snippet)

        const lastUpdated = {
            raw: fetchedVideos[videoId].rawData.snippet.publishedAt,
            timestamp: parseGithubDate(fetchedVideos[videoId].rawData.snippet.publishedAt).timestamp,
        }

        // console.log('fetchedVideos[videoId].thumbnails', fetchedVideos[videoId].thumbnails)

        videos.push({
            name: fetchedVideos[videoId].title,
            id: videoId,
            lastUpdated,
            apps,
            slug,
            timestamps: fetchedVideos[videoId].timestamps,
            thumbnails: fetchedVideos[videoId].rawData.snippet.thumbnails,
            endpoint: `/tv/${slug}`
        })
    }

    // console.log('videos', videos)

    // publishedAt

    return videos.sort(byTimeThenNull)
}


import slugify from 'slugify'
import axios from 'axios'

import { byTimeThenNull } from './sort-list.js'
import { getVideoEndpoint } from './app-derived.js'
import parseGithubDate from './parse-github-date'

export function matchesWholeWord (needle, haystack) {
    return new RegExp('\\b' + needle + '\\b').test(haystack)
}

const videoFeaturesApp = function (app, video) {
    const appFuzzyName = app.name.toLowerCase()
    if (video.title.toLowerCase().includes(appFuzzyName)) return true

    const appIsInTimestamps = video.timestamps.map( timestamp => timestamp.fullText.toLowerCase()).includes(appFuzzyName)

    if (appIsInTimestamps) return true

    if (matchesWholeWord(appFuzzyName, video.description.toLowerCase())) return true

    return false
}

const generateVideoTags = function ( video ) {
    const tags = {
        'benchmark': {
            relatedWords: [
                'benchmarks',
                'comparison',
                'speed test',
                'bench mark',
                'bench marks'
            ]
        },
        'performance': {
            relatedWords: [
                'speed'
            ]
        }
    }

    const videoTags = video.tags

    // Match tags against video titles and descriptions
    for (const tagKey in tags) {

        // Skip if this video already has this tag
        // then skip it
        if (videoTags.includes(tagKey)) continue

        const matchingWords = [
            tagKey,
            ...tags[tagKey].relatedWords
        ]

        for (const tagWord of matchingWords) {

            // Skip if this video already has this tag
            // then stop this loop
            if (videoTags.includes(tagKey)) break

            // Check title
            if (matchesWholeWord(tagWord.toLowerCase(), video.title.toLowerCase())) {
                videoTags.push(tagKey)

                // console.log(video.title, 'has', tagKey, 'tag')

                // We're done since the tag matched for the title
                continue
            }

            // Check description
            if (matchesWholeWord(tagWord.toLowerCase(), video.description.toLowerCase())) {
                videoTags.push(tagKey)

                // console.log(video.title, 'has', tagKey, 'tag')
            }
        }
    }

    return videoTags
}

export default async function ( applist ) {

    // Fetch Commits
    const response = await axios.get(process.env.VIDEO_SOURCE)
    // Extract commit from response data
    const fetchedVideos = response.data

    // console.log('fetchedVideos', fetchedVideos)

    const videos = []

    for (const videoId in fetchedVideos) {

        // Skip private videos
        if (fetchedVideos[videoId].title === 'Private video') continue

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
            tags: generateVideoTags(fetchedVideos[videoId]),
            timestamps: fetchedVideos[videoId].timestamps,
            thumbnails: fetchedVideos[videoId].rawData.snippet.thumbnails,
            endpoint: getVideoEndpoint({
                slug
            })
        })
    }

    // console.log('videos', videos)

    // publishedAt

    return videos.sort(byTimeThenNull)
}

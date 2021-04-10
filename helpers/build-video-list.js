
import slugify from 'slugify'
import axios from 'axios'

import { fuzzyMatchesWholeWord } from './matching.js'
import { byTimeThenNull } from './sort-list.js'
import { getVideoEndpoint } from './app-derived.js'
import parseDate from './parse-date'


const inTimestamps = ( name, video ) => {
    // If this is empty
    // then reutrn false
    if ( video.timestamps.length === 0 ) return false

    for ( const timestamp of video.timestamps ) {
        if ( fuzzyMatchesWholeWord(name, timestamp.fullText ) ) return true
    }

    return false
}

const videoFeaturesApp = function (app, video) {
    const appFuzzyName = app.name.toLowerCase()

    if ( fuzzyMatchesWholeWord(appFuzzyName, video.title ) ) return true

    if ( inTimestamps(appFuzzyName, video) ) return true

    if ( fuzzyMatchesWholeWord(appFuzzyName, video.description ) ) return true

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

    const videoTags = new Set()

    video.tags.forEach( tag => {
        videoTags.add(tag)
    })

    // Match tags against video titles and descriptions
    for (const tagKey in tags) {

        // Skip if this video already has this tag
        // then skip it
        if (videoTags.has(tagKey)) continue

        const matchingWords = [
            tagKey,
            ...tags[tagKey].relatedWords
        ]

        for (const tagWord of matchingWords) {

            // Skip if this video already has this tag
            // then stop this loop
            if (videoTags.has(tagKey)) break

            // Check title
            if (fuzzyMatchesWholeWord( tagWord, video.title )) {
                videoTags.add(tagKey)

                // console.log(video.title, 'has', tagKey, 'tag')

                // We're done since the tag matched for the title
                continue
            }

            // Check description
            if (fuzzyMatchesWholeWord( tagWord, video.description )) {
                videoTags.add(tagKey)

                // console.log(video.title, 'has', tagKey, 'tag')
            }
        }
    }

    return videoTags
}

const makeThumbnailData = function ( thumbnails, widthLimit = null ) {

    const thumbnailEntries = Object.entries( thumbnails )
    const srcsetArray = []

    let maxWidth = 0

    thumbnailEntries.forEach(([thumbnailKey, thumbnail]) => {
        if ( widthLimit !== null &&  widthLimit < thumbnail.width) return

        // If this width is more than known maxWidth
        // then set maxWidth
        if (thumbnail.width > maxWidth) maxWidth = thumbnail.width

        // Add this width to our srcset
        srcsetArray.push(`${thumbnail.url} ${thumbnail.width}w`)
    })


    const sizes = `(max-width: ${maxWidth}px) 100vw, ${maxWidth}px`
    const srcset = srcsetArray.join(', ')
    const src = thumbnails.default.url

    // console.log('srcsetArray', srcsetArray)

    return {
        sizes,
        srcset,
        src
    }
}

export default async function ( applist ) {

    const videosJsonUrl = `${process.env.VFUNCTIONS_URL}/videos.json`

    // Fetch Commits
    const response = await axios.get( videosJsonUrl )
    // Extract commit from response data
    const fetchedVideos = response.data

    // console.log('fetchedVideos', fetchedVideos)

    const videos = []

    for (const videoId in fetchedVideos) {

        // Skip private videos
        if (fetchedVideos[videoId].title === 'Private video') continue

        // Skip deleted videos
        if (fetchedVideos[videoId].title === 'Deleted video') continue

        // Build video slug
        const slug = slugify(`${fetchedVideos[videoId].title}-i-${videoId}`, {
            lower: true,
            strict: true
        })

        const apps = []
        // Generate new tag set based on api data
        const tags = generateVideoTags(fetchedVideos[videoId])

        for ( const app of applist ) {
            if (videoFeaturesApp(app, fetchedVideos[videoId])) {
                apps.push(app.slug)

                tags.add(app.category.slug)
            }
        }

        // console.log('fetchedVideos[videoId].rawData.snippet', fetchedVideos[videoId].rawData.snippet)

        const lastUpdated = {
            raw: fetchedVideos[videoId].rawData.snippet.publishedAt,
            timestamp: parseDate(fetchedVideos[videoId].rawData.snippet.publishedAt).timestamp,
        }

        // console.log('fetchedVideos[videoId].thumbnails', fetchedVideos[videoId].thumbnails)

        videos.push({
            name: fetchedVideos[videoId].title,
            id: videoId,
            lastUpdated,
            apps,
            slug,
            channel: {
                name: fetchedVideos[videoId].rawData.snippet.channelTitle,
                id: fetchedVideos[videoId].rawData.snippet.channelId
            },
            // Convert tags set into array
            tags: Array.from(tags),
            timestamps: fetchedVideos[videoId].timestamps,
            // thumbnails: fetchedVideos[videoId].rawData.snippet.thumbnails,
            thumbnail: makeThumbnailData( fetchedVideos[videoId].rawData.snippet.thumbnails, 700 ),
            endpoint: getVideoEndpoint({
                slug
            })
        })
    }

    // console.log('videos', videos)

    // publishedAt

    return videos.sort(byTimeThenNull)
}

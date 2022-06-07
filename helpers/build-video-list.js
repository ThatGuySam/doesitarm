import fs from 'fs-extra'
import { PromisePool } from '@supercharge/promise-pool'

import { fuzzyMatchesWholeWord } from './matching.js'
import { byTimeThenNull } from './sort-list.js'
import { getVideoEndpoint } from './app-derived.js'
import parseDate from './parse-date'
import { makeSlug } from './slug.js'
import { youtubeVideoPath } from '~/helpers/api/youtube/build.js'


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

async function handleFetchedVideo ( fetchedVideo, videoId, applist ) {

    // Skip private videos
    if (fetchedVideo.title === 'Private video') return

    // Skip deleted videos
    if (fetchedVideo.title === 'Deleted video') return

    // Build video slug
    const slug = makeSlug( `${fetchedVideo.title}-i-${videoId}` )

    const apps = []
    // Generate new tag set based on api data
    const tags = generateVideoTags(fetchedVideo)

    for ( const app of applist ) {
        if (videoFeaturesApp(app, fetchedVideo)) {
            apps.push(app.slug)

            tags.add(app.category.slug)
        }
    }

    // console.log('fetchedVideo.rawData.snippet', fetchedVideo.rawData.snippet)

    const lastUpdated = {
        raw: fetchedVideo.rawData.snippet.publishedAt,
        timestamp: parseDate(fetchedVideo.rawData.snippet.publishedAt).timestamp,
    }

    // console.log('fetchedVideo.thumbnails', fetchedVideo.thumbnails)

    return {
        name: fetchedVideo.title,
        id: videoId,
        lastUpdated,
        apps,
        slug,
        channel: {
            name: fetchedVideo.rawData.snippet.channelTitle,
            id: fetchedVideo.rawData.snippet.channelId
        },
        // Convert tags set into array
        tags: Array.from(tags),
        timestamps: fetchedVideo.timestamps,
        // thumbnails: fetchedVideo.rawData.snippet.thumbnails,
        thumbnail: makeThumbnailData( fetchedVideo.rawData.snippet.thumbnails, 700 ),
        endpoint: getVideoEndpoint({
            slug
        })
    }
}

export default async function ( applist ) {

    // const videosJsonUrl = process.env.VIDEO_SOURCE || `${process.env.VFUNCTIONS_URL}/videos.json`

    // Fetch Commits
    // const response = await axios.get( videosJsonUrl )
    // Extract commit from response data
    const fetchedVideos = await fs.readJson( youtubeVideoPath )//response.data

    const videos = []

    await PromisePool
        .withConcurrency(1000)
        .for( Object.entries( fetchedVideos ) )
        .process(async ( [ videoId, fetchedVideo ], index, pool ) => {
            const mappedVideo = await handleFetchedVideo ( fetchedVideo, videoId, applist )

            // Skip if this video is not an object
            if ( Object( mappedVideo ) !== mappedVideo ) return

            videos.push( mappedVideo )
        })

    // console.log('videos', videos)

    // publishedAt

    return videos.sort(byTimeThenNull)
}

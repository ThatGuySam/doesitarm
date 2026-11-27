import fs from 'fs-extra'

import { getJson } from '~/helpers/http.js'


export const youtubeVideoPath = './static/api/youtube-videos.json'

// Daily snapshot published by the doesitarm-youtube Workers (workers/youtube-api).
export const youtubeSnapshotUrl = 'https://youtube.doesitarm.com/snapshot/youtube-videos.json'

// Last published copy of the video list, served by the current API.
export const publishedYouTubeVideosUrl = 'https://api.doesitarm.com/api/youtube-videos.json'

// Order to try: an explicit VIDEO_SOURCE, then the snapshot, then the last
// published copy. VIDEO_SOURCE set to the published copy (the old setting)
// only republishes what the API already serves, so it is kept as the fallback
// instead of being tried before the snapshot.
export function defaultYouTubeVideoSources ( videoSource = process.env.VIDEO_SOURCE ) {
    const explicitSource = videoSource === publishedYouTubeVideosUrl ? null : videoSource

    return [
        explicitSource,
        youtubeSnapshotUrl,
        publishedYouTubeVideosUrl
    ]
}


function isVideoMap ( value ) {
    return value !== null && typeof value === 'object' && !Array.isArray( value )
}

// The YouTube Data API reader (and its googleapis dependency) was removed.
// The build copies the video snapshot made by the doesitarm-youtube Workers.
// Video data is optional, so a dead or non-JSON source falls back to the
// next one and must not fail the whole API build.
export async function saveYouTubeVideos ( {
    sources = defaultYouTubeVideoSources()
} = {} ) {
    const uniqueSources = [ ...new Set( sources.filter( Boolean ) ) ]

    for ( const source of uniqueSources ) {
        try {
            const youtubeVideos = await getJson( source )

            if ( !isVideoMap( youtubeVideos ) ) {
                throw new Error( 'response is not a video map object' )
            }

            await fs.outputJson( youtubeVideoPath, youtubeVideos )

            console.log( `Saved ${ Object.keys( youtubeVideos ).length } YouTube videos from ${ source }` )

            return youtubeVideos
        } catch ( error ) {
            console.warn( `Warning: could not load YouTube videos from ${ source }: ${ error?.message ?? error }` )
        }
    }

    console.warn( 'Warning: no YouTube video source worked, so the API is built with an empty video list.' )

    await fs.outputJson( youtubeVideoPath, {} )

    return {}
}

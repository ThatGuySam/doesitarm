import fs from 'fs-extra'

import { getJson } from '~/helpers/http.js'


export const youtubeVideoPath = './static/api/youtube-videos.json'

// Last published copy of the video list, served by the current API.
export const publishedYouTubeVideosUrl = 'https://api.doesitarm.com/api/youtube-videos.json'


function isVideoMap ( value ) {
    return value !== null && typeof value === 'object' && !Array.isArray( value )
}

// The YouTube Data API reader (and its googleapis dependency) was removed:
// YouTube API access is off, and the build only republishes a saved
// snapshot of the video list. Video data is optional, so a dead or
// non-JSON source must not fail the whole API build.
export async function saveYouTubeVideos ( {
    sources = [
        process.env.VIDEO_SOURCE,
        publishedYouTubeVideosUrl
    ]
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

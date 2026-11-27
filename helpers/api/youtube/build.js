import fs from 'fs-extra'

import { playlists, benchmarksPlaylistId } from './playlists.js'
import { getJson } from '~/helpers/http.js'


export const youtubeVideoPath = './static/api/youtube-videos.json'


export const youtubePlaylistItemsEndpoint = 'https://www.googleapis.com/youtube/v3/playlistItems'

// Calls the YouTube Data API v3 directly with fetch.
// This replaced the googleapis package, whose auth chain
// (google-auth-library -> jws -> jwa -> buffer-equal-constant-time)
// reads buffer.SlowBuffer at import time. Node 26 removed SlowBuffer,
// so merely importing googleapis crashed every API build.
export async function getPlaylistsItems ( {
    playlistId,
    apiKey = process.env.GOOGLE_API_KEY,
    perPage = 50
} = {} ) {
    if ( !playlistId ) {
        throw new Error( 'getPlaylistsItems needs a playlistId' )
    }

    const items = []
    let pageToken = null

    do {
        const url = new URL( youtubePlaylistItemsEndpoint )

        url.searchParams.set( 'key', apiKey )
        url.searchParams.set( 'part', 'snippet,contentDetails' )
        url.searchParams.set( 'playlistId', playlistId )
        url.searchParams.set( 'maxResults', String( perPage ) )

        if ( pageToken ) {
            url.searchParams.set( 'pageToken', pageToken )
        }

        const data = await getJson( url ).catch( error => {
            console.log( 'Error fetching playlist', playlistId, error?.response?.data ?? error )

            throw error
        } )

        for ( const item of data?.items ?? [] ) {
            items.push( item )
        }

        pageToken = data?.nextPageToken ?? null
    } while ( pageToken )

    console.log(`Fetched ${items.length} videos from https://www.youtube.com/playlist?list=${ playlistId }`)

    return items
}

export async function getYouTubeVideos ( options = {} ) {

    const {
        // requestsDelay = 3600,
    } = options

    // Fetch all videos from playlists
    const playlistSets = []

    for ( const playlistToFetch of playlists ) {

        // console.log('playlistJsonUrl', playlistJsonUrl)

        const playlistItems = await getPlaylistsItems({
            playlistId: playlistToFetch.id
        })
        // console.log('playlistItems', playlistItems.length)

        playlistSets.push( playlistItems )
    }

    // Pull benchmarksPlaylist out of playlist sets
    // benchmarksPlaylistId
    const benchmarksVideoIds = playlistSets.find( playlist => {
        // Skip empty playlists
        if (playlist.length === 0) return false

        // Get this playlist's ID from first video
        // and check against benchmarksPlaylistId
        return playlist[0].snippet.playlistId === benchmarksPlaylistId
    }).map( video => video.contentDetails.videoId)

    // Creat an object to store playlist items
    const playlistItems = {}


    // Loop through the sets and store all the videos into a single array
    for (const playlistSet of playlistSets) {
        for (const playlistItem of playlistSet) {
            // If we've already stored this video
            // then skip
            if (playlistItems.hasOwnProperty(playlistItem.contentDetails.videoId)) continue

            const tags = []

            // If this video is in the benchmarks playlist
            // then add the benchmark tag
            if (benchmarksVideoIds.includes(playlistItem.contentDetails.videoId)) {
                tags.push('benchmark')
            }

            // Store newly found video
            playlistItems[playlistItem.contentDetails.videoId] = {
                title: playlistItem.snippet.title,
                description: playlistItem.snippet.description,
                timestamps: [],
                rawData: playlistItem,
                tags
            }
        }
    }


    // Loop through playlist items and store timestamp data
    for (const videoId in playlistItems) {
        // console.log('playlistItem', playlistItem)
        // If the description is empty
        // then skip
        if (playlistItems[videoId].description.trim().length === 0) continue

        // Break up the description by line breaks
        const descriptionLines = playlistItems[videoId].description.split(/\r?\n/)

        // console.log('descriptionLines', descriptionLines)

        for (const line of descriptionLines) {
            // https://stackoverflow.com/a/11067610/1397641
            const matches = line.match(/(?:([0-5]?[0-9]):)?([0-5]?[0-9]):([0-5][0-9])/)

            // If there are no timestamps on this line
            // then skip
            if (matches === null) continue

            playlistItems[videoId].timestamps.push({
                time: matches[0],
                fullText: line
            })
        }
    }

    return playlistItems
}


export async function saveYouTubeVideos () {
    // We'll need to lean up this function to work with 10k API Requests
    // before we can use it again
    // const youtubeVideos = await getYouTubeVideos()

    // Locked previously sucessful YouTube API data for now
    const youtubeVideos = await getJson( process.env.VIDEO_SOURCE )


    // Save to JSON
    await fs.outputJson( youtubeVideoPath, youtubeVideos )

}

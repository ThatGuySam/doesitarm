import fs from 'fs-extra'
import { google } from 'googleapis'
import axios from 'axios'

import { playlists, benchmarksPlaylistId } from './playlists.js'


export const youtubeVideoPath = './static/api/youtube-videos.json'


async function getPlaylistsItems ( { playlistId } = {} ) {
    const perPage = 50

    // Setup Youtube API V3 Service instance
    const service = google.youtube('v3')

    // Fetch data from the Youtube API
    const { errors = null, data = null } = await service.playlistItems.list({
        key: process.env.GOOGLE_API_KEY,
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: perPage
    }).catch(({ errors }) => {

        console.log('Error fetching playlist', errors)

        return {
            errors
        }
    })

    // Send an error response if something went wrong
    if (errors !== null) {
        throw new Error(errors)

        return
    }

    const items = data.items

    // If there are more results then push them to our playlist
    if (data.nextPageToken !== null) {

        // Store the token for page #2 into our variable
        let pageToken = data.nextPageToken

        while (pageToken !== null) {
            // Fetch data from the Youtube API
            const youtubePageResponse = await service.playlistItems.list({
                key: process.env.GOOGLE_API_KEY,
                part: 'snippet,contentDetails',
                playlistId,
                maxResults: perPage,
                pageToken: pageToken
            })

            // Add the videos from this page on to our total items list
            youtubePageResponse.data.items.forEach(item => items.push(item))

            // Now that we're done set up the next page token or empty out the pageToken variable so our loop will stop
            pageToken = ('nextPageToken' in youtubePageResponse.data) ? youtubePageResponse.data.nextPageToken : null
        }
    }

    console.log(`Fetched ${items.length} videos from https://www.youtube.com/playlist?list=${ playlistId }`)

    return items
}

async function getYouTubeVideos ( options = {} ) {

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
    const youtubeVideos = await axios( process.env.VIDEO_SOURCE )
        .then( response => response.data )


    // Save to JSON
    await fs.outputJson( youtubeVideoPath, youtubeVideos )

}

import fs from 'fs-extra'

import {
    buildVideoListingFromFetchedVideo,
    makeVideoSlug
} from '~/helpers/build-video-list.js'
import { saveYouTubeVideos, youtubeVideoPath } from '~/helpers/api/youtube/build.js'

const outputPath = './static/api/youtube-video-listings.json'
const trailingCommaPattern = /,\s*([\]}])/g

async function readJsonWithTrailingCommaFallback ( path ) {
    return JSON.parse(
        ( await fs.readFile( path, 'utf8' ) ).replace( trailingCommaPattern, '$1' )
    )
}

await saveYouTubeVideos()

const [
    fetchedVideos,
    appList,
    gameList
] = await Promise.all([
    fs.readJson( youtubeVideoPath ),
    readJsonWithTrailingCommaFallback( './static/app-list.json' ),
    readJsonWithTrailingCommaFallback( './static/game-list.json' )
])

const allVideoAppsList = [
    ...appList,
    ...gameList
]
const videoListingsBySlug = {}

for ( const [ videoId, fetchedVideo ] of Object.entries( fetchedVideos ) ) {
    const videoListing = await buildVideoListingFromFetchedVideo(
        fetchedVideo,
        videoId,
        allVideoAppsList
    )

    if ( videoListing === undefined ) continue

    videoListingsBySlug[ makeVideoSlug( fetchedVideo.title, videoId ) ] = videoListing
}

await fs.outputJson( outputPath, videoListingsBySlug )

console.log(
    `Wrote ${ Object.keys( videoListingsBySlug ).length } video listing fallbacks to ${ outputPath }`
)

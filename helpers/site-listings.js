import youtubeVideosText from '~/static/api/youtube-videos.json?raw'
import appListText from '~/static/app-list.json?raw'
import deviceListText from '~/static/device-list.json?raw'
import gameListText from '~/static/game-list.json?raw'

import {
    buildVideoListingFromFetchedVideo,
    makeVideoSlug
} from '~/helpers/build-video-list.js'
const trailingCommaPattern = /,\s*([\]}])/g
const parsedDeviceList = JSON.parse( deviceListText.replace( trailingCommaPattern, '$1' ) )
const parsedAppList = JSON.parse( appListText.replace( trailingCommaPattern, '$1' ) )
const parsedGameList = JSON.parse( gameListText.replace( trailingCommaPattern, '$1' ) )
const parsedYoutubeVideos = JSON.parse( youtubeVideosText )

export function getDeviceListingBySlug ( slug ) {
    return parsedDeviceList.find( device => device.slug === slug ) || null
}

function getAllVideoAppsList () {
    return [
        ...parsedAppList,
        ...parsedGameList
    ]
}

export async function getVideoListingBySlug ( slug ) {
    const allVideoAppsList = getAllVideoAppsList()

    for ( const [ videoId, fetchedVideo ] of Object.entries( parsedYoutubeVideos ) ) {
        if ( makeVideoSlug( fetchedVideo.title, videoId ) !== slug ) continue

        return await buildVideoListingFromFetchedVideo( fetchedVideo, videoId, allVideoAppsList )
    }

    return null
}

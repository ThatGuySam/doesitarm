import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

import {
    buildVideoListingFromFetchedVideo,
    makeVideoSlug
} from '~/helpers/build-video-list.js'
import { youtubeVideoPath } from '~/helpers/api/youtube/build.js'

const currentModuleDirectory = path.dirname( fileURLToPath( import.meta.url ) )
const appListPath = path.join( currentModuleDirectory, '../static/app-list.json' )
const gameListPath = path.join( currentModuleDirectory, '../static/game-list.json' )
const deviceListPath = path.join( currentModuleDirectory, '../static/device-list.json' )
const trailingCommaPattern = /,\s*([\]}])/g

function parseGeneratedJsonFile ( filePath ) {
    const fileContents = fs.readFileSync( filePath, 'utf8' )

    return JSON.parse( fileContents.replace( trailingCommaPattern, '$1' ) )
}

export function getDeviceListingBySlug ( slug ) {
    const deviceList = parseGeneratedJsonFile( deviceListPath )

    return deviceList.find( device => device.slug === slug ) || null
}

function getAllVideoAppsList () {
    return [
        ...parseGeneratedJsonFile( appListPath ),
        ...parseGeneratedJsonFile( gameListPath )
    ]
}

export async function getVideoListingBySlug ( slug ) {
    const fetchedVideos = await fs.readJson( youtubeVideoPath )
    const allVideoAppsList = getAllVideoAppsList()

    for ( const [ videoId, fetchedVideo ] of Object.entries( fetchedVideos ) ) {
        if ( makeVideoSlug( fetchedVideo.title, videoId ) !== slug ) continue

        return await buildVideoListingFromFetchedVideo( fetchedVideo, videoId, allVideoAppsList )
    }

    return null
}

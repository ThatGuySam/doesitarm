import videoListingsText from '~/static/api/youtube-video-listings.json?raw'

import { getDeviceListingBySlug } from './device-catalog.js'

const parsedVideoListings = JSON.parse( videoListingsText )

export { getDeviceListingBySlug }

export async function getVideoListingBySlug ( slug ) {
    return parsedVideoListings[slug] || null
}

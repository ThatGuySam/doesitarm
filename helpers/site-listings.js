import videoListingsText from '~/static/api/youtube-video-listings.json?raw'

import { deviceListingFallbacks } from './device-list-fallbacks.js'

const parsedVideoListings = JSON.parse( videoListingsText )

export function getDeviceListingBySlug ( slug ) {
    return deviceListingFallbacks.find( device => device.slug === slug ) || null
}

export async function getVideoListingBySlug ( slug ) {
    return parsedVideoListings[slug] || null
}

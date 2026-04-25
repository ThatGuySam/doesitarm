import deviceListText from '~/static/device-list.json?raw'
import videoListingsText from '~/static/api/youtube-video-listings.json?raw'

const trailingCommaPattern = /,\s*([\]}])/g
const parsedDeviceList = JSON.parse( deviceListText.replace( trailingCommaPattern, '$1' ) )
const parsedVideoListings = JSON.parse( videoListingsText )

export function getDeviceListingBySlug ( slug ) {
    return parsedDeviceList.find( device => device.slug === slug ) || null
}

export async function getVideoListingBySlug ( slug ) {
    return parsedVideoListings[slug] || null
}

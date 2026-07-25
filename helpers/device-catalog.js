import deviceCatalogText from '~/data/apple-silicon-devices.json?raw'

export const deviceCatalog = JSON.parse( deviceCatalogText )

export const deviceListings = deviceCatalog.devices

export function getListedDeviceListings () {
    return deviceListings.filter( device => device.listed )
}

export function getDeviceListingBySlug ( slug ) {
    return deviceListings.find( device => device.slug === slug ) || null
}

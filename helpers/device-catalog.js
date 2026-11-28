import deviceCatalogText from '~/data/apple-silicon-devices.json?raw'

export const deviceCatalog = JSON.parse( deviceCatalogText )

export const deviceListings = deviceCatalog.devices

export function getListedDeviceListings () {
    return deviceListings.filter( device => device.listed )
}

export function getDeviceListingBySlug ( slug ) {
    return deviceListings.find( device => device.slug === slug ) || null
}

// Amazon Associates tag used by the device "Check Pricing" links since 2021
// (the old amzn.to short links redirect with tag=doesitarm-20).
export const amazonAffiliateTag = 'doesitarm-20'

// Amazon search link for a catalog device, e.g. "Apple MacBook Neo A18 Pro".
// A search keeps working as Apple adds configurations, unlike a single product page.
export function getDeviceAmazonUrl ( device ) {
    const chip = Array.isArray( device?.chips ) ? device.chips[0] : ''
    const query = [ 'Apple', device?.shortName || device?.name, chip ]
        .filter( Boolean )
        .join( ' ' )
    const params = new URLSearchParams( { k: query, tag: amazonAffiliateTag } )

    return `https://www.amazon.com/s?${ params }`
}

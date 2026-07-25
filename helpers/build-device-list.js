import { getListedDeviceListings } from './device-catalog.js'

export function getDeviceEndpoint ( slug ) {
    return `/device/${ slug }`
}



export default async function () {
    return getListedDeviceListings().map( device => ({
        ...device,
        endpoint: getDeviceEndpoint( device.slug ),
    }))
}

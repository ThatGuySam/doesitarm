import { makeSlug } from './slug.js'
import { getJson } from './http.js'

export function getDeviceEndpoint ( slug ) {
    return `/device/${ slug }`
}



export default async function () {

    const devicesJsonUrl = `${process.env.VFUNCTIONS_URL}/api/devices`

    const rawDeviceList = await getJson( devicesJsonUrl )
        .catch(function (error) {
            // handle error
            console.warn('Error fetching device list', error)
        })

    return rawDeviceList.filter( device => ( device.enabled !== 'no' ) ).map( device => {
        const slug = makeSlug( device.name )

        return {
            ...device,
            slug,
            endpoint: getDeviceEndpoint( slug ),
        }
    })
}

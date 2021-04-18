import axios from 'axios'

import { makeSlug } from './slug.js'

export function getDeviceEndpoint ( slug ) {
    return `/device/${ slug }`
}



export default async function () {

    const devicesJsonUrl = `${process.env.VFUNCTIONS_URL}/api/devices`

    const rawDeviceList = await axios.get(devicesJsonUrl)
        .then( response => {
            return response.data
        })
        .catch(function (error) {
            // handle error
            console.warn('Error fetching device list', error)
        })

    return rawDeviceList.map( device => {
        const slug = makeSlug( device.name )

        return {
            ...device,
            slug,
            endpoint: getDeviceEndpoint( slug ),
        }
    })
}

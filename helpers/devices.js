
import { getStatusName } from './statuses.js'


export const macAppleSiliconStatuses = new Set([
    'native',
    'rosetta'
])

export function deviceSupportsApp ( device, app ) {

    // const statuses = {
    //     '✅': 'native',
    //     '✳️': 'rosetta',
    //     '⏹': 'no-in-progress',
    //     '🚫': 'no',
    //     '🔶': 'unreported',
    // }
    const appStatus = getStatusName( app.text )

    if ( device.type === 'intel') {

        return true
    }

    if ( device.type === 'mac-apple-silicon') {

        return macAppleSiliconStatuses.has( appStatus )
    }

    // if ( device.type === 'ios') {

    //     return
    // }

    return false
}

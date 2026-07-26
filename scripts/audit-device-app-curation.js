import {
    getCuratedDeviceAppPage
} from '~/helpers/device-app-curation.js'
import {
    getListedDeviceListings
} from '~/helpers/device-catalog.js'

const expectedListSize = 12
const maximumSharedApps = 4

async function main () {
    const auditResults = []

    for ( const device of getListedDeviceListings() ) {
        const page = await getCuratedDeviceAppPage( device )
        const appSlugs = page.items.map( listing => listing.slug )
        const appSlugSet = new Set( appSlugs )
        const categorySlugs = new Set(
            page.items.map( listing => listing.category?.slug )
        )
        const missingCategories = device.buyerProfile.appCategories
            .map( category => category.slug )
            .filter( slug => !categorySlugs.has( slug ) )

        if ( appSlugs.length !== expectedListSize ) {
            throw new Error(
                `${ device.slug } returned ${ appSlugs.length } apps; expected ${ expectedListSize }`
            )
        }

        if ( appSlugSet.size !== appSlugs.length ) {
            throw new Error( `${ device.slug } contains duplicate apps` )
        }

        if ( missingCategories.length > 0 ) {
            throw new Error(
                `${ device.slug } is missing categories: ${ missingCategories.join( ', ' ) }`
            )
        }

        auditResults.push({
            device: device.slug,
            categories: device.buyerProfile.appCategories.map( category => category.slug ),
            apps: appSlugs
        })
    }

    for ( const [ leftIndex, leftResult ] of auditResults.entries() ) {
        const leftSlugs = new Set( leftResult.apps )

        for ( const rightResult of auditResults.slice( leftIndex + 1 ) ) {
            const sharedApps = rightResult.apps
                .filter( slug => leftSlugs.has( slug ) )

            if ( sharedApps.length > maximumSharedApps ) {
                throw new Error(
                    `${ leftResult.device } and ${ rightResult.device } share ${ sharedApps.length } apps: ${ sharedApps.join( ', ' ) }`
                )
            }
        }
    }

    console.log( JSON.stringify( auditResults, null, 2 ) )
}

main().catch( error => {
    console.error( error )
    process.exit( 1 )
} )

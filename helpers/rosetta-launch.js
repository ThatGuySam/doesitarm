// Both the Astro frontend and the subscriptions Worker use this launch switch.
export const rosettaLaunchEnabled = false
export const rosettaSignupsClosedMessage = 'Signups are not open yet'

export async function rosettaPage404 ( rewrite, enabled = rosettaLaunchEnabled ) {
    if ( enabled ) return null

    const response = await rewrite( '/404' )
    response.headers.set( 'Cache-Control', 'no-store' )
    return response
}

// Forwards footer signups to Kit (kit.com), which owns the weekly newsletter:
// double opt-in, unsubscribes, bounces and broadcasts. D1 stays the record of
// every signup, so anything Kit misses can be backfilled later.
//
// Kit v4 has no single "subscribe to form" call. The subscriber is created
// first, as inactive so Kit treats them as unconfirmed, then added to the form,
// which sends the form's confirmation email when double opt-in is on.
// https://developers.kit.com/api-reference/subscribers/create-a-subscriber
// https://developers.kit.com/api-reference/forms/add-subscriber-to-form-by-email-address

const kitApiBase = 'https://api.kit.com/v4'
const kitTimeoutMs = 5000

export function isKitConfigured ( env = {} ) {
    return Boolean( env.KIT_API_KEY ) && /^\d+$/.test( String( env.KIT_FORM_ID || '' ) )
}

async function postKit ( path, body, env, fetchImpl ) {
    const response = await fetchImpl( `${ kitApiBase }${ path }`, {
        body: JSON.stringify( body ),
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Kit-Api-Key': env.KIT_API_KEY
        },
        method: 'POST',
        signal: AbortSignal.timeout( kitTimeoutMs )
    } )

    if ( !response.ok ) {
        // Status only: Kit error bodies can echo the address back
        throw new Error( `Kit ${ path.split( '/' )[1] } request failed with ${ response.status }` )
    }

    return response
}

export async function subscribeToKit ( email, env, fetchImpl = fetch ) {
    if ( !isKitConfigured( env ) ) {
        return { sent: false, reason: 'not-configured' }
    }

    await postKit( '/subscribers', {
        email_address: email,
        state: 'inactive'
    }, env, fetchImpl )

    const formResponse = await postKit( `/forms/${ env.KIT_FORM_ID }/subscribers`, {
        email_address: email,
        referrer: 'https://doesitarm.com'
    }, env, fetchImpl )

    // 201 = newly added to the form, 200 = already on it
    return { sent: true, alreadyOnForm: formResponse.status === 200 }
}

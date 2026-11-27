import { rosettaLaunchEnabled } from '../../../helpers/rosetta-launch.js'

const siteUrl = 'https://doesitarm.com'

export const appStatusLabels = Object.freeze({
    'native': 'Native Apple Silicon support',
    'rosetta': 'Requires Rosetta 2',
    'no': 'Unsupported on Apple Silicon',
    'no-in-progress': 'Unsupported on Apple Silicon, with support in progress',
    'unreported': 'Compatibility unreported'
})

function makeAppStatusMessage ( notification, from, mailingAddress ) {
    const appUrl = `${siteUrl}/app/${notification.app_key}`
    const unsubscribeUrl = `${siteUrl}/api/subscriptions/unsubscribe?token=${encodeURIComponent( notification.unsubscribe_token )}`
    const previousStatus = appStatusLabels[notification.previous_status]
    const currentStatus = appStatusLabels[notification.current_status]
    let update = `The status for ${notification.app_name} changed from ${previousStatus} to ${currentStatus}.\n\n${appUrl}`

    if ( !previousStatus ) {
        update = `${notification.app_name} was added to Does It ARM. Its listed status is ${currentStatus}.\n\n${appUrl}`
    }

    return {
        from: { address: from, name: 'Does It ARM' },
        to: notification.email,
        subject: `Does It ARM update for ${notification.app_name}`,
        text: [
            update,
            `You signed up for Apple Silicon compatibility updates about ${notification.app_name} on Does It ARM.`,
            `Unsubscribe from updates for this app: ${unsubscribeUrl}`,
            `Does It ARM\n${mailingAddress}`
        ].join( '\n\n' ),
        headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
    }
}

function makeConfirmationMessage ( notification, from, mailingAddress ) {
    const url = `${siteUrl}/api/subscriptions/confirm?token=${encodeURIComponent( notification.confirmation_token )}`
    return {
        from: { address: from, name: 'Does It ARM' },
        to: notification.email,
        subject: 'Confirm your Does It ARM signup',
        text: [
            'Review and confirm your pending Does It ARM email signups.',
            notification.consent,
            `Confirm within 48 hours: ${url}`,
            'Select the signups you want to keep on the confirmation page. Older signups may expire before the link does.',
            'If you did not request this, you can ignore this message.',
            `Does It ARM\n${mailingAddress}`
        ].join( '\n\n' )
    }
}

async function sendThroughCloudflare ( url, token, message ) {
    const response = await fetch( url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify( message ),
        redirect: 'error',
        signal: AbortSignal.timeout( 10000 )
    } )

    if ( response.status === 429 ) return { state: 'rate-limited' }
    if ( [401, 403, 404].includes( response.status ) ) return { state: 'blocked' }
    if ( response.status >= 400 && response.status < 500 ) return { state: 'rejected' }
    if ( !response.ok ) return { state: 'needs-review' }

    const { result, success } = await response.json()
    if ( !success || !result ) return { state: 'needs-review' }

    const messageId = typeof result.message_id === 'string' ? result.message_id : null

    if ( result.delivered?.includes( message.to ) || result.queued?.includes( message.to ) ) {
        return { state: 'accepted', messageId }
    }

    if ( result.permanent_bounces?.includes( message.to ) || result.suppressed_recipients?.includes( message.to ) ) {
        return { state: 'rejected', messageId }
    }

    return { state: 'needs-review', messageId }
}

export function makeEmailSender ( env ) {
    if ( !rosettaLaunchEnabled || !env.ROSETTA_EMAIL_MODE || env.ROSETTA_EMAIL_MODE === 'dry-run' ) {
        return {
            mode: 'dry-run',
            async send () {
                return { state: 'dry-run' }
            }
        }
    }

    const accountId = env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim()
    const token = env.CLOUDFLARE_EMAIL_API_TOKEN?.trim()
    const from = env.ROSETTA_EMAIL_FROM?.trim()
    const mailingAddress = env.ROSETTA_MAILING_ADDRESS?.trim()

    if ( env.ROSETTA_EMAIL_MODE !== 'live' || !/^[a-f0-9]{32}$/i.test( accountId ) ||
        !token || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test( from ) || !mailingAddress ) {
        throw new Error( 'Rosetta email delivery configuration is incomplete.' )
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`

    return {
        mode: 'live',
        async send ( notification ) {
            if ( notification.mode === 'dry-run' ) return { state: 'dry-run' }

            const makeMessage = notification.type === 'confirmation' ? makeConfirmationMessage : makeAppStatusMessage
            return await sendThroughCloudflare( url, token, makeMessage( notification, from, mailingAddress ) )
        }
    }
}

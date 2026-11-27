import { discardPendingInterests, pendingInterest, pendingInterestCutoff, pruneExpiredSignups,
    subscriptionPage, tokenPattern } from './interests.js'
import { makeEmailSender } from './mailer.js'

export const confirmationPath = '/api/subscriptions/confirm'
const confirmationLifetime = 48 * 60 * 60 * 1000
const confirmationDay = 24 * 60 * 60 * 1000
const maximumDailyConfirmations = 3

const pendingInterests = `
    SELECT 1 FROM interest_subscriptions
    WHERE email = confirmation.email AND ${pendingInterest}
`

const activeConfirmation = `
    confirmation.token = ?1 AND confirmation.valid_until > ?2
    AND confirmation.state IN ('sending', 'accepted', 'needs-review')
`

const withinDailyLimit = `
    (SELECT COUNT(*) FROM interest_confirmations AS previous
        WHERE previous.email = confirmation.email AND previous.attempted_at > ?2) < ?3
`

function formatConsent ( interest ) {
    return interest.interest_key ? `${interest.consent} (${interest.interest_key})` : interest.consent
}

function escapeHtml ( text ) {
    return text.replaceAll( '&', '&amp;' ).replaceAll( '<', '&lt;' ).replaceAll( '>', '&gt;' )
}

export async function handleConfirmation ( request, database, form ) {
    const { searchParams } = new URL( request.url )
    const token = searchParams.get( 'token' ) || ''
    const invalidLink = () => subscriptionPage( 'Invalid confirmation link', '<p>Sign up again to request a new link.</p>', 400 )
    if ( !tokenPattern.test( token ) ) return invalidLink()

    const now = Date.now()
    const cutoff = pendingInterestCutoff( now )
    const confirmUrl = `${confirmationPath}?token=${token}`

    if ( request.method === 'GET' ) {
        const { results: interests } = await database.prepare( `
            SELECT CAST(interest.id AS TEXT) AS id, interest.interest_key, interest.consent
            FROM interest_confirmations AS confirmation
            JOIN interest_subscriptions AS interest ON interest.email = confirmation.email
            WHERE ${activeConfirmation} AND ${pendingInterest} AND interest.created_at > ?3
            ORDER BY interest.id
        ` ).bind( token, now, cutoff ).all()
        if ( !interests.length ) return invalidLink()

        return subscriptionPage( 'Confirm subscriptions', `
            <p>Select the emails you want. Saving your choices removes any pending signups you leave unchecked.</p>
            <form method="post" action="${confirmUrl}">
                <input type="hidden" name="reviewed" value="1">
                <fieldset>
                    <legend>Pending signups</legend>
                    ${interests.map( interest => `<p><label><input type="checkbox" name="interest" value="${interest.id}">
                        ${escapeHtml( formatConsent( interest ) )}</label></p>` ).join( '' )}
                </fieldset>
                <p><button type="submit">Save choices</button></p>
            </form>
        ` )
    }

    if ( form?.get( 'reviewed' ) !== '1' ) return invalidLink()
    const selected = [...new Set( form.getAll( 'interest' ) )]
    if ( selected.some( id => !/^[1-9]\d{0,18}$/.test( id ) ) ) return invalidLink()

    const selectedIds = 'SELECT value FROM json_each(?3)'
    // An expired or evicted selection requires a fresh review before any signups are changed.
    const reviewedEmail = `
        SELECT confirmation.email FROM interest_confirmations AS confirmation
        WHERE ${activeConfirmation} AND NOT EXISTS (
            SELECT 1 FROM json_each(?3) AS selected WHERE NOT EXISTS (
                SELECT 1 FROM interest_subscriptions
                WHERE id = selected.value AND email = confirmation.email
                    AND ${pendingInterest} AND created_at > ?4
            )
        )
    `
    const parameters = [token, now, JSON.stringify( selected ), cutoff]
    const [optedOut, discarded, confirmed, , { results: [stillActive] }] = await database.batch( [
        ...discardPendingInterests( database,
            `email = (${reviewedEmail}) AND id NOT IN (${selectedIds})`, ...parameters ),
        database.prepare( `
            WITH reviewed AS MATERIALIZED (${reviewedEmail})
            UPDATE interest_subscriptions SET confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE email = (SELECT email FROM reviewed) AND id IN (${selectedIds})
        ` ).bind( ...parameters ),
        database.prepare( `
            UPDATE interest_confirmations AS confirmation
            SET state = 'confirmed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE ${activeConfirmation} AND NOT EXISTS (${pendingInterests})
        ` ).bind( token, now ),
        database.prepare( `
            SELECT 1 FROM interest_confirmations AS confirmation WHERE ${activeConfirmation}
        ` ).bind( token, now )
    ] )

    if ( confirmed.meta.changes > 0 ) {
        return subscriptionPage( 'Subscriptions confirmed', '<p>You are subscribed to these emails from Does It ARM.</p>' )
    }
    if ( optedOut.meta.changes > 0 || discarded.meta.changes > 0 ) {
        return subscriptionPage( 'Signups discarded', '<p>You discarded these pending signups.</p>' )
    }
    if ( stillActive ) {
        return subscriptionPage( 'Review your subscriptions', `<p><a href="${confirmUrl}">Review the current signups</a> before confirming.</p>`, 409 )
    }
    return invalidLink()
}

export async function deliverConfirmations ( env, token = null ) {
    const database = env.SUBSCRIPTIONS_DB
    const sender = makeEmailSender( env )
    const outcomes = { accepted: 0, rejected: 0, needsReview: 0, blocked: false, rateLimited: false }
    const now = Date.now()
    if ( token === null ) await database.batch( pruneExpiredSignups( database, now ) )

    if ( sender.mode === 'live' ) {
        const deliverableInterests = `${pendingInterests} AND created_at > ?4`
        const { results } = await database.prepare( `
            SELECT confirmation.token AS confirmation_token, confirmation.email FROM interest_confirmations AS confirmation
            WHERE confirmation.state = 'pending' AND EXISTS (${deliverableInterests}) AND ${withinDailyLimit}
                AND (?1 IS NULL OR confirmation.token = ?1)
            ORDER BY confirmation.updated_at, confirmation.token
            LIMIT 20
        ` ).bind( token, now - confirmationDay, maximumDailyConfirmations, pendingInterestCutoff( now ) ).all()

        for ( const message of results ) {
            const sentAt = Date.now()
            const cutoff = pendingInterestCutoff( sentAt )
            const [claim, { results: interests }] = await database.batch( [
                database.prepare( `
                    UPDATE interest_confirmations AS confirmation
                    SET state = 'sending', attempted_at = ?5, valid_until = ?6,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE token = ?1 AND state = 'pending' AND EXISTS (${deliverableInterests}) AND ${withinDailyLimit}
                ` ).bind( message.confirmation_token, sentAt - confirmationDay, maximumDailyConfirmations,
                    cutoff, sentAt, sentAt + confirmationLifetime ),
                database.prepare( `
                    SELECT interest.interest_key, interest.consent FROM interest_confirmations AS confirmation
                    JOIN interest_subscriptions AS interest ON interest.email = confirmation.email
                    WHERE confirmation.token = ?1 AND ${pendingInterest} AND interest.created_at > ?2
                    ORDER BY interest.id
                ` ).bind( message.confirmation_token, cutoff )
            ] )
            if ( claim.meta.changes !== 1 ) continue

            let delivery
            try {
                delivery = await sender.send( { ...message, type: 'confirmation', consent: interests.map( formatConsent ).join( '\n' ) } )
            } catch {
                delivery = { state: 'needs-review' }
            }

            const { state, messageId = null } = delivery
            const paused = state === 'rate-limited' || state === 'blocked'
            await database.prepare( `
                UPDATE interest_confirmations
                SET state = ?1, provider_message_id = ?2,
                    valid_until = CASE WHEN ?1 = 'pending' THEN NULL ELSE valid_until END,
                    attempted_at = CASE WHEN ?1 = 'pending' THEN NULL ELSE attempted_at END,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE token = ?3 AND state = 'sending'
            ` ).bind( paused ? 'pending' : state, messageId, message.confirmation_token ).run()

            if ( paused ) {
                outcomes.blocked = state === 'blocked'
                outcomes.rateLimited = state === 'rate-limited'
                break
            }

            outcomes[state === 'needs-review' ? 'needsReview' : state]++
        }
    }

    const { pending } = await database.prepare( `
        SELECT COUNT(*) AS pending FROM interest_confirmations WHERE state = 'pending'
    ` ).first()
    return { ...outcomes, pending }
}

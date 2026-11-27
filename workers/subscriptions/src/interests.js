import { getSubscriptionConsent } from '../../../helpers/subscription-interests.js'
import { loadRosettaCatalog } from '../../../helpers/rosetta-catalog.js'

const unsubscribePath = '/api/subscriptions/unsubscribe'
export const tokenPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/
const sourcePattern = /^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*\/?$/
const maximumPendingInterests = 20
const pendingInterestProtection = 15 * 60 * 1000
const pendingInterestLifetime = 72 * 60 * 60 * 1000
export const pendingInterest = 'confirmed_at IS NULL AND unsubscribed_at IS NULL'

export function pendingInterestCutoff ( now ) {
    return new Date( now - pendingInterestLifetime ).toISOString()
}

export function discardPendingInterests ( database, condition, ...parameters ) {
    // Keep the unsubscribed row when historical deliveries still reference it.
    const hasDeliveries = 'EXISTS (SELECT 1 FROM rosetta_notifications WHERE subscription_id = interest_subscriptions.id)'
    const matching = `${pendingInterest} AND (${condition})`
    return [
        database.prepare( `
            UPDATE interest_subscriptions SET unsubscribed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE ${matching} AND ${hasDeliveries}
        ` ).bind( ...parameters ),
        database.prepare( `
            DELETE FROM interest_subscriptions WHERE ${matching} AND NOT ${hasDeliveries}
        ` ).bind( ...parameters )
    ]
}

export function pruneExpiredSignups ( database, now, email = null ) {
    const cutoff = pendingInterestCutoff( now )
    const emailScope = email === null ? '' : 'AND email = ?2'
    const parameters = email === null ? [] : [email]
    return [
        ...discardPendingInterests( database, `created_at <= ?1 ${emailScope}`, cutoff, ...parameters ),
        database.prepare( `
            UPDATE interest_confirmations AS confirmation
            SET state = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE state IN ('pending', 'sending', 'accepted', 'needs-review') ${emailScope}
                AND (valid_until <= ?1 OR NOT EXISTS (
                    SELECT 1 FROM interest_subscriptions WHERE email = confirmation.email AND ${pendingInterest}
                ))
        ` ).bind( now, ...parameters )
    ]
}

export async function saveInterest ( database, { email, kind, key, source } ) {
    const consent = typeof kind === 'string' && typeof key === 'string'
        ? getSubscriptionConsent( kind, key )
        : null

    if ( !consent || typeof source !== 'string' || source.length > 200 ||
        source.startsWith( '//' ) || !sourcePattern.test( source ) ) {
        return false
    }

    if ( kind === 'app-status' ) {
        const { apps } = await loadRosettaCatalog()
        if ( !apps.some( app => app.endpoint === `/app/${ key }` ) ) return false
    }

    const unsubscribeToken = crypto.randomUUID()
    const confirmationToken = crypto.randomUUID()
    const now = Date.now()
    const interestKey = 'email = ?1 AND kind = ?2 AND interest_key = ?3'
    const activeInterest = `SELECT 1 FROM interest_subscriptions WHERE ${interestKey} AND unsubscribed_at IS NULL`
    const pendingCount = `(SELECT COUNT(*) FROM interest_subscriptions WHERE email = ?1 AND ${pendingInterest})`
    const results = await database.batch( [
        ...pruneExpiredSignups( database, now, email ),
        ...discardPendingInterests( database, `id = (
            SELECT id FROM interest_subscriptions
            WHERE email = ?1 AND ${pendingInterest} AND created_at <= ?5
                AND ${pendingCount} = ?4 AND NOT EXISTS (${activeInterest})
            ORDER BY created_at, id LIMIT 1
        )`, email, kind, key, maximumPendingInterests, new Date( now - pendingInterestProtection ).toISOString() ),
        database.prepare( `
            INSERT INTO interest_subscriptions (
                email, kind, interest_key, source, consent, unsubscribe_token, created_at
            )
            SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
            WHERE ${pendingCount} < ?8 AND NOT EXISTS (${activeInterest})
            ON CONFLICT (email, kind, interest_key) DO UPDATE SET
                source = excluded.source,
                consent = excluded.consent,
                unsubscribe_token = excluded.unsubscribe_token,
                created_at = excluded.created_at,
                confirmed_at = NULL,
                unsubscribed_at = NULL
            WHERE interest_subscriptions.unsubscribed_at IS NOT NULL
        ` ).bind( email, kind, key, source.replace( /\/$/, '' ) || '/', consent, unsubscribeToken,
            new Date( now ).toISOString(), maximumPendingInterests ),
        database.prepare( `
            INSERT INTO interest_confirmations (email, token)
            SELECT ?1, ?4 WHERE EXISTS (
                SELECT 1 FROM interest_subscriptions WHERE ${interestKey} AND ${pendingInterest}
            )
            ON CONFLICT DO NOTHING
        ` ).bind( email, kind, key, confirmationToken ),
        database.prepare( activeInterest ).bind( email, kind, key )
    ] )

    const [queued, { results: [saved] }] = results.slice( -2 )
    return saved ? { confirmationToken: queued.meta.changes === 1 ? confirmationToken : null } : { atCapacity: true }
}

export function subscriptionPage ( title, content, status = 200, headers = {} ) {
    return new Response( `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${ title } | Does It ARM</title>
    <style>
        body { font: 1rem / 1.5 system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; }
        button { font: inherit; padding: .55rem 1rem; }
    </style>
</head>
<body>
    <main>
        <h1>${ title }</h1>
        ${ content }
        <p><a href="/">Return to Does It ARM</a></p>
    </main>
</body>
</html>`, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
            'Content-Type': 'text/html; charset=utf-8',
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
            ...headers
        }
    } )
}

export async function handleUnsubscribe ( request, database ) {
    const token = new URL( request.url ).searchParams.get( 'token' ) || ''

    if ( !tokenPattern.test( token ) ) {
        return subscriptionPage( 'Invalid unsubscribe link', '<p>Use the link from your email.</p>', 400 )
    }

    if ( request.method === 'GET' ) {
        return subscriptionPage( 'Unsubscribe', `
            <p>Stop receiving emails for this subscription.</p>
            <form method="post" action="${ unsubscribePath }?token=${ token }">
                <button type="submit">Unsubscribe</button>
            </form>
        ` )
    }

    await database.batch( [
        database.prepare( `
            UPDATE interest_subscriptions
            SET unsubscribed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE unsubscribe_token = ?1 AND unsubscribed_at IS NULL
        ` ).bind( token ),
        database.prepare( `
            UPDATE interest_confirmations
            SET state = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE email = (SELECT email FROM interest_subscriptions WHERE unsubscribe_token = ?1)
                AND state = 'pending' AND NOT EXISTS (
                    SELECT 1 FROM interest_subscriptions
                    WHERE email = interest_confirmations.email AND confirmed_at IS NULL AND unsubscribed_at IS NULL
                )
        ` ).bind( token )
    ] )

    return subscriptionPage( 'Unsubscribed', '<p>This link no longer has an active subscription.</p>' )
}

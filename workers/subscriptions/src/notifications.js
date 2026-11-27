import { fetchRosettaCatalog, rosettaBaselineMinimum, RosettaCatalogError } from '../../../helpers/rosetta-catalog.js'
import { appListingPath } from '../../../helpers/subscription-interests.js'
import { makeEmailSender } from './mailer.js'

const reappearanceWindow = 30 * 24 * 60 * 60 * 1000

const incomingApps = `
    SELECT json_extract(value, '$[0]') AS app_key,
        json_extract(value, '$[1]') AS app_name,
        json_extract(value, '$[2]') AS status
    FROM rosetta_review_catalogs AS catalog, json_each(catalog.apps)
    WHERE catalog.id = ?1
`

const missingApps = `
    app_key NOT IN (SELECT app_key FROM incoming)
    AND app_key NOT IN (SELECT value FROM json_each(
        (SELECT invalid_keys FROM rosetta_review_catalogs WHERE id = ?1)
    ))
`

const catalogComparison = `
    WITH incoming AS (${incomingApps}), changes AS (
        SELECT incoming.app_key, incoming.app_name, snapshot.status AS previous_status,
            incoming.status AS current_status
        FROM incoming LEFT JOIN rosetta_app_snapshot AS snapshot USING (app_key)
        WHERE snapshot.status IS NULL OR snapshot.status <> incoming.status
        UNION ALL
        SELECT app_key, app_name, status, NULL
        FROM rosetta_app_snapshot WHERE ${missingApps}
    )
`

const changesWithPriorStatus = `
    ${catalogComparison}, changes_with_prior_status AS (
        SELECT change.app_key, change.app_name, coalesce(change.previous_status, removed.last_status) AS previous_status,
            change.current_status
        FROM changes AS change
        JOIN rosetta_observations AS observation ON observation.id = ?1
        LEFT JOIN rosetta_removed_apps AS removed ON removed.app_key = change.app_key
            AND change.previous_status IS NULL
            AND removed.last_seen_at > observation.observed_at - ${reappearanceWindow}
    )
`

const snapshotCount = '(SELECT COUNT(*) FROM rosetta_app_snapshot)'
const snapshotTime = '(SELECT observed_at FROM rosetta_snapshot_state WHERE id = 1)'
const catalogPresent = 'EXISTS (SELECT 1 FROM rosetta_review_catalogs WHERE id = observation.id)'
const canRemoveMissingApps = '(SELECT unkeyed_rows FROM rosetta_review_catalogs WHERE id = ?1) = 0'

const reviewAvailable = `
    observation.status = 'refused' AND observation.incoming_count > 0 AND observation.observed_at > ${snapshotTime}
    AND EXISTS (
        SELECT 1 FROM rosetta_review_catalogs
        WHERE id = observation.id AND baseline_observed_at = ${snapshotTime}
    )
`

const canNotifyOnReview = `
    observation.reason = 'too-many-changes'
    AND ${snapshotCount} > 0
    AND ${snapshotCount} = (SELECT app_count FROM rosetta_snapshot_state WHERE id = 1)
`

const readObservation = `
    SELECT id, status, reason, resolution, previous_count AS previousCount, incoming_count AS incomingCount,
        changed_count AS changedCount, bad_rows AS badRows, (${reviewAvailable}) AS reviewable
    FROM rosetta_observations AS observation WHERE id = ?1
`

const activeSubscription = `
    subscription.id = rosetta_notifications.subscription_id
    AND subscription.unsubscribed_at IS NULL
    AND subscription.confirmed_at IS NOT NULL
    AND subscription.created_at = rosetta_notifications.subscription_created_at
`

function eligibleSubscriptions ( changeSource, observationJoin = '' ) {
    const observedAt = "strftime('%Y-%m-%dT%H:%M:%fZ', observation.observed_at / 1000.0, 'unixepoch')"
    return `
        FROM ${changeSource} AS change
        JOIN interest_subscriptions AS subscription ON subscription.interest_key = change.app_key
        ${observationJoin}
        WHERE change.current_status IS NOT NULL AND subscription.kind = 'app-status'
            AND change.current_status IS NOT change.previous_status
            AND subscription.unsubscribed_at IS NULL
            AND subscription.created_at <= ${observedAt} AND subscription.confirmed_at <= ${observedAt}
    `
}

function applyObservation ( database, id, mode ) {
    const accepted = `
        observation.id = ?1 AND observation.status = 'accepted'
        AND observation.observed_at > ${snapshotTime} AND ${catalogPresent}
    `
    const canApply = `EXISTS (SELECT 1 FROM rosetta_observations AS observation WHERE ${accepted})`
    const observedAt = '(SELECT observed_at FROM rosetta_observations WHERE id = ?1)'

    return [
        database.prepare( `
            ${changesWithPriorStatus}
            INSERT INTO rosetta_app_changes (app_key, app_name, previous_status, current_status, observed_at)
            SELECT change.app_key, change.app_name, change.previous_status, change.current_status, observation.observed_at
            FROM changes_with_prior_status AS change
            JOIN rosetta_observations AS observation ON observation.id = ?1
            JOIN rosetta_review_catalogs AS catalog ON catalog.id = observation.id
            WHERE ${accepted} AND ${snapshotTime} > 0 AND ${snapshotCount} > 0
                AND observation.resolution IS NOT 'silent'
                AND (change.current_status IS NOT NULL OR catalog.unkeyed_rows = 0)
        ` ).bind( id ),
        database.prepare( `
            INSERT INTO rosetta_notifications (change_id, subscription_id, subscription_created_at, mode)
            SELECT change.id, subscription.id, subscription.created_at, ?2
            ${eligibleSubscriptions( 'rosetta_app_changes',
                'JOIN rosetta_observations AS observation ON observation.observed_at = change.observed_at'
            )}
                AND ${accepted} AND observation.resolution IS NOT 'silent'
        ` ).bind( id, mode ),
        database.prepare( `
            WITH incoming AS (${incomingApps})
            DELETE FROM rosetta_app_snapshot
            WHERE ${canApply} AND ${missingApps} AND ${canRemoveMissingApps}
        ` ).bind( id ),
        database.prepare( `
            WITH incoming AS (${incomingApps})
            INSERT INTO rosetta_app_snapshot (app_key, app_name, status)
            SELECT app_key, app_name, status FROM incoming WHERE ${canApply}
            ON CONFLICT (app_key) DO UPDATE SET app_name = excluded.app_name, status = excluded.status
            WHERE app_name <> excluded.app_name OR status <> excluded.status
        ` ).bind( id ),
        database.prepare( `
            DELETE FROM rosetta_removed_apps
            WHERE ${canApply} AND last_seen_at <= ${observedAt} - ${reappearanceWindow}
        ` ).bind( id ),
        database.prepare( `
            UPDATE rosetta_snapshot_state
            SET observed_at = ${observedAt}, app_count = ${snapshotCount}
            WHERE id = 1 AND ${canApply}
        ` ).bind( id )
    ]
}

function pruneReviewCatalogs ( database ) {
    return database.prepare( `
        DELETE FROM rosetta_review_catalogs
        WHERE id NOT IN (
            SELECT observation.id FROM rosetta_observations AS observation
            WHERE ${reviewAvailable}
                AND reason IN ('initial-catalog-too-small', 'catalog-shrank', 'too-many-changes', 'snapshot-incomplete')
            ORDER BY observed_at DESC, rowid DESC LIMIT 1
        )
    ` )
}

async function recordCatalogRefusal ( database, error, observedAt ) {
    const id = crypto.randomUUID()
    const badRows = error.badRows || 0
    const incomingCount = Math.max( 0, ( error.totalRows || 0 ) - badRows )
    const reason = badRows ? 'too-many-bad-rows' : 'invalid-catalog'
    const [, { results: [observation] }] = await database.batch( [
        database.prepare( `
            INSERT INTO rosetta_observations (id, observed_at, previous_count, incoming_count, changed_count, bad_rows, status, reason)
            SELECT ?1, ?2, app_count, ?3, 0, ?4, 'refused', ?5 FROM rosetta_snapshot_state WHERE id = 1
        ` ).bind( id, observedAt, incomingCount, badRows, reason ),
        database.prepare( readObservation ).bind( id )
    ] )
    return { changes: 0, notifications: 0, observation }
}

async function storeObservation ( database, catalog, observedAt, mode ) {
    const id = crypto.randomUUID()
    const invalidAppKeys = new Set( catalog.invalidAppKeys )
    const incoming = JSON.stringify( catalog.apps
        .map( app => [app.endpoint.match( appListingPath )[1], app.name, app.status] )
        .filter( ( [key] ) => !invalidAppKeys.has( key ) ) )

    // Stage the catalog, decide, and update the baseline in one D1 transaction.
    const [, , changes, notifications, ...remaining] = await database.batch( [
        database.prepare( `
            INSERT INTO rosetta_review_catalogs (id, baseline_observed_at, apps, invalid_keys, unkeyed_rows)
            VALUES (?1, ${snapshotTime}, ?2, ?3, ?4)
        ` ).bind( id, incoming, JSON.stringify( catalog.invalidAppKeys ), catalog.unkeyedRows ),
        database.prepare( `
            ${catalogComparison}, counts AS (
                SELECT state.observed_at, state.app_count AS previous_count, ${snapshotCount} AS snapshot_count,
                    (SELECT COUNT(*) FROM incoming) AS incoming_count, catalog.unkeyed_rows,
                    (SELECT COUNT(*) FROM changes) AS computed_changes,
                    (SELECT COUNT(*) FROM changes WHERE current_status IS NULL) AS possible_removals,
                    (SELECT COUNT(*) FROM rosetta_app_snapshot WHERE app_key IN (
                        SELECT value FROM json_each(catalog.invalid_keys)
                    )) AS retained_count
                FROM rosetta_snapshot_state AS state, rosetta_review_catalogs AS catalog
                WHERE state.id = 1 AND catalog.id = ?1
            ), reconciled AS (
                SELECT *, computed_changes - min(possible_removals, unkeyed_rows) AS assessed_changes
                FROM counts
            ), decisions AS (
                SELECT previous_count, incoming_count,
                    CASE WHEN observed_at = 0 OR snapshot_count <> previous_count THEN 0 ELSE assessed_changes END AS changed_count,
                    CASE
                        WHEN observed_at >= ?2 THEN 'older-observation'
                        WHEN observed_at = 0 AND incoming_count < ?4 THEN 'initial-catalog-too-small'
                        WHEN observed_at > 0 AND (snapshot_count = 0 OR snapshot_count <> previous_count) THEN 'snapshot-incomplete'
                        WHEN (incoming_count + retained_count + unkeyed_rows) * 10 < previous_count * 9 THEN 'catalog-shrank'
                        WHEN previous_count > 0 AND assessed_changes > 1
                            AND assessed_changes * 100 > previous_count * 2 THEN 'too-many-changes'
                    END AS reason
                FROM reconciled
            )
            INSERT INTO rosetta_observations (id, observed_at, previous_count, incoming_count, changed_count, bad_rows, status, reason)
            SELECT ?1, ?2, previous_count, incoming_count, changed_count, ?3,
                CASE
                    WHEN reason IS NULL THEN 'accepted'
                    WHEN reason = 'older-observation' THEN 'superseded'
                    ELSE 'refused'
                END, reason
            FROM decisions
        ` ).bind( id, observedAt, catalog.badRows, rosettaBaselineMinimum ),
        ...applyObservation( database, id, mode ),
        pruneReviewCatalogs( database ),
        database.prepare( readObservation ).bind( id )
    ] )

    const { results: [observation] } = remaining.at( -1 )
    return { changes: changes.meta.changes, notifications: notifications.meta.changes, observation }
}

export async function previewRosettaReview ( database, id ) {
    const [{ results: [review] }, { results: changes }] = await database.batch( [
        database.prepare( `
            ${changesWithPriorStatus}
            SELECT observation.id, reason, previous_count AS previousCount, incoming_count AS incomingCount,
                bad_rows AS badRows,
                (SELECT COUNT(*) FROM changes WHERE previous_status IS NULL) AS additionCount,
                (SELECT COUNT(*) FROM changes WHERE current_status IS NULL AND ${canRemoveMissingApps}) AS removalCount,
                (${canNotifyOnReview}) AS canNotify,
                CASE WHEN ${canNotifyOnReview} THEN (SELECT COUNT(*) ${eligibleSubscriptions( 'changes_with_prior_status' )})
                    ELSE 0 END AS notificationCount
            FROM rosetta_observations AS observation WHERE observation.id = ?1 AND ${reviewAvailable}
        ` ).bind( id ),
        database.prepare( `
            ${changesWithPriorStatus}
            SELECT change.app_key AS appKey, change.app_name AS appName,
                change.previous_status AS previousStatus, change.current_status AS currentStatus
            FROM changes_with_prior_status AS change
            JOIN rosetta_observations AS observation ON observation.id = ?1
            WHERE ${reviewAvailable} AND (change.current_status IS NOT NULL OR ${canRemoveMissingApps})
            ORDER BY change.app_key
        ` ).bind( id )
    ] )

    return review ? { ...review, canNotify: Boolean( review.canNotify ), changes } : null
}

export async function acceptRosettaReview ( env, id, expectedNotifications, expectedMode ) {
    const database = env.SUBSCRIPTIONS_DB
    const mode = expectedNotifications === null ? null : makeEmailSender( env ).mode
    if ( mode !== expectedMode ) return null

    const [approval, changes, notifications] = await database.batch( [
        database.prepare( `
            ${changesWithPriorStatus}
            UPDATE rosetta_observations AS observation
            SET status = 'accepted', resolution = CASE WHEN ?2 IS NULL THEN 'silent' ELSE 'notify' END
            WHERE observation.id = ?1 AND ${reviewAvailable}
                AND (?2 IS NULL OR (${canNotifyOnReview}
                    AND ?2 = (SELECT COUNT(*) ${eligibleSubscriptions( 'changes_with_prior_status' )})))
        ` ).bind( id, expectedNotifications ),
        ...applyObservation( database, id, mode ),
        pruneReviewCatalogs( database )
    ] )

    return approval.meta.changes === 1
        ? { id, mode, resolution: expectedNotifications === null ? 'silent' : 'notify',
            changes: changes.meta.changes, notifications: notifications.meta.changes }
        : null
}

const deliveryOutcomes = () => ( {
    accepted: 0, dryRun: 0, rejected: 0, needsReview: 0, blocked: false, rateLimited: false
} )

async function countPending ( database ) {
    const { pending } = await database.prepare( `
        SELECT COUNT(*) AS pending FROM rosetta_notifications WHERE state = 'pending'
    ` ).first()
    return pending
}

async function deliverPending ( database, sender ) {
    const [, { results }] = await database.batch( [
        database.prepare( `
            UPDATE rosetta_notifications SET state = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE state = 'pending' AND (
                NOT EXISTS (SELECT 1 FROM interest_subscriptions AS subscription WHERE ${activeSubscription})
                OR EXISTS (SELECT 1 FROM rosetta_app_changes WHERE id = change_id AND current_status IS NULL)
            )
        ` ),
        database.prepare( `
            SELECT notification.id, notification.mode, change.app_key, change.app_name,
                change.previous_status, change.current_status, subscription.email, subscription.unsubscribe_token
            FROM rosetta_notifications AS notification
            JOIN rosetta_app_changes AS change ON change.id = notification.change_id
            JOIN interest_subscriptions AS subscription ON subscription.id = notification.subscription_id
            WHERE notification.state = 'pending' AND (notification.mode = 'dry-run' OR ?1 = 'live')
            ORDER BY notification.id
            LIMIT ?2
        ` ).bind( sender.mode, sender.mode === 'live' ? 40 : 20 )
    ] )

    const outcomes = deliveryOutcomes()

    for ( const notification of results ) {
        const claim = await database.prepare( `
            UPDATE rosetta_notifications SET state = 'sending', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?1 AND state = 'pending' AND EXISTS (
                SELECT 1 FROM interest_subscriptions AS subscription WHERE ${activeSubscription}
            )
        ` ).bind( notification.id ).run()

        if ( claim.meta.changes !== 1 ) continue

        let delivery
        try {
            delivery = await sender.send( notification )
        } catch {
            // Cloudflare's send API has no documented idempotency key. Review an ambiguous attempt before retrying it.
            delivery = { state: 'needs-review' }
        }

        const { state: outcome, messageId = null } = delivery
        const paused = outcome === 'rate-limited' || outcome === 'blocked'
        await database.prepare( `
            UPDATE rosetta_notifications
            SET state = ?1, provider_message_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?3 AND state = 'sending'
        ` ).bind( paused ? 'pending' : outcome, messageId, notification.id ).run()

        if ( paused ) {
            outcomes.blocked = outcome === 'blocked'
            outcomes.rateLimited = outcome === 'rate-limited'
            break
        }

        const key = { 'dry-run': 'dryRun', 'needs-review': 'needsReview' }[outcome] || outcome
        outcomes[key]++
    }

    return { ...outcomes, pending: await countPending( database ) }
}

export async function runRosettaCheck ( env ) {
    const observedAt = Date.now()
    const sender = makeEmailSender( env )
    const database = env.SUBSCRIPTIONS_DB
    let report

    try {
        const catalog = await fetchRosettaCatalog( fetch, { timeout: 10000 } )
        report = await storeObservation( database, catalog, observedAt, sender.mode )
    } catch ( error ) {
        if ( !( error instanceof RosettaCatalogError ) ) throw error
        report = await recordCatalogRefusal( database, error, observedAt )
    }

    const deliveries = report.observation.status === 'refused'
        ? { ...deliveryOutcomes(), pending: await countPending( database ), skipped: true }
        : await deliverPending( database, sender )

    return { ...report, mode: sender.mode, deliveries }
}

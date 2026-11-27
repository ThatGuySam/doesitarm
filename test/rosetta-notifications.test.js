import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rosettaBaselineMinimum } from '../helpers/rosetta-catalog.js'
import { handleRequest } from '../workers/subscriptions/src/index.js'
import { runRosettaCheck } from '../workers/subscriptions/src/notifications.js'
import { makeSubscriptionsDatabase } from './helpers/subscriptions-database.js'

const launch = vi.hoisted( () => ( { enabled: true } ) )
const baseline = vi.hoisted( () => ( { minimum: 1 } ) )
vi.mock( '../helpers/rosetta-launch.js', () => ( {
    get rosettaLaunchEnabled () { return launch.enabled }
} ) )
vi.mock( '../helpers/rosetta-catalog.js', async importOriginal => {
    const catalog = await importOriginal()
    return { ...catalog, get rosettaBaselineMinimum () { return baseline.minimum ?? catalog.rosettaBaselineMinimum } }
} )

const appListUrl = 'https://api.doesitarm.com/app-list.json'
const accountId = '1'.repeat( 32 )
const emailUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`
const liveSettings = {
    CLOUDFLARE_EMAIL_ACCOUNT_ID: accountId,
    CLOUDFLARE_EMAIL_API_TOKEN: 'fake-email-token',
    ROSETTA_EMAIL_MODE: 'live',
    ROSETTA_EMAIL_FROM: 'updates@example.com',
    ROSETTA_MAILING_ADDRESS: '123 Example Street'
}

function app ( key, status, name = key ) {
    return { endpoint: `/app/${key}`, name, status }
}

function catalog ( count ) {
    return Array.from( { length: count }, ( _, index ) => app( `app-${index}`, 'rosetta' ) )
}

describe( 'Rosetta status notifications', () => {
    let sqlite, database, loadFeed, sendEmail, now

    beforeEach( () => {
        ( { database, sqlite } = makeSubscriptionsDatabase() )
        launch.enabled = true
        baseline.minimum = 1
        now = Date.UTC( 2026, 10, 25 )
        vi.spyOn( Date, 'now' ).mockImplementation( () => now )
        loadFeed = vi.fn()
        sendEmail = vi.fn( async ( _url, { body } ) => {
            const { to } = JSON.parse( body )
            return Response.json( { success: true, result: { queued: [to], message_id: '<test@example.com>' } } )
        } )
        vi.stubGlobal( 'fetch', ( url, options ) => {
            if ( url === appListUrl ) return loadFeed()
            if ( url === emailUrl ) return sendEmail( url, options )
            throw new Error( 'Unexpected request.' )
        } )
    } )

    afterEach( () => {
        sqlite.close()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    } )

    function subscribe ( email, key, {
        kind = 'app-status', unsubscribedAt = null, confirmedAt = new Date( now ).toISOString()
    } = {} ) {
        const token = crypto.randomUUID()
        sqlite.prepare( `
            INSERT INTO interest_subscriptions (
                email, kind, interest_key, source, consent, unsubscribe_token, created_at, unsubscribed_at, confirmed_at
            ) VALUES (?, ?, ?, '/rosetta-checker', 'Consent for test subscription', ?, ?, ?, ?)
        ` ).run( email, kind, key, token, new Date( now ).toISOString(), unsubscribedAt, confirmedAt )
        return token
    }

    function check ( apps, settings = {} ) {
        now += 1000
        loadFeed.mockResolvedValueOnce( Response.json( apps ) )
        return runRosettaCheck( { SUBSCRIPTIONS_DB: database, ...settings } )
    }

    function adminRequest ( path, method = 'GET', token = 'test-review-secret', settings = liveSettings ) {
        return handleRequest( new Request( `https://doesitarm.com/api/subscriptions/${path}`, {
            method, headers: token ? { Authorization: `Bearer ${token}` } : {}
        } ), { SUBSCRIPTIONS_DB: database, ROSETTA_CHECK_TOKEN: 'test-review-secret', ...settings } )
    }

    function reviewPath ( id ) {
        return `review-rosetta?observation=${id}`
    }

    function changes () {
        return sqlite.prepare( `
            SELECT app_key, previous_status, current_status FROM rosetta_app_changes ORDER BY app_key
        ` ).all()
    }

    function deliveries () {
        return sqlite.prepare( `
            SELECT change.app_key, subscription.email, notification.state
            FROM rosetta_notifications AS notification
            JOIN rosetta_app_changes AS change ON change.id = notification.change_id
            JOIN interest_subscriptions AS subscription ON subscription.id = notification.subscription_id
            ORDER BY change.app_key, subscription.email
        ` ).all()
    }

    it( 'seeds the first snapshot silently and ignores repeated statuses and name changes', async () => {
        subscribe( 'first@example.com', 'editor' )

        const initial = await check( [app( 'editor', 'rosetta', 'Old Name' )] )
        const same = await check( [app( 'editor', 'rosetta', 'New Name' )] )

        expect( initial ).toMatchObject( { changes: 0, notifications: 0, mode: 'dry-run' } )
        expect( same ).toMatchObject( { changes: 0, notifications: 0 } )
        expect( changes() ).toEqual( [] )
        expect( deliveries() ).toEqual( [] )
        expect( sqlite.prepare( 'SELECT * FROM rosetta_app_snapshot' ).all() ).toEqual( [
            { app_key: 'editor', app_name: 'New Name', status: 'rosetta' }
        ] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'records removals and notifies confirmed subscribers of status changes and additions', async () => {
        subscribe( 'editor@example.com', 'editor' )
        subscribe( 'another-editor@example.com', 'editor' )
        subscribe( 'mixer@example.com', 'mixer' )
        subscribe( 'legacy@example.com', 'legacy' )
        subscribe( 'newcomer@example.com', 'newcomer' )
        subscribe( 'unsubscribed@example.com', 'editor', { unsubscribedAt: new Date( now ).toISOString() } )
        subscribe( 'unconfirmed@example.com', 'editor', { confirmedAt: null } )
        subscribe( 'confirmed-too-late@example.com', 'editor', { confirmedAt: new Date( now + 5000 ).toISOString() } )
        subscribe( 'stable@example.com', 'stable' )
        subscribe( 'news@example.com', '', { kind: 'rosetta-news' } )
        subscribe( 'waitlist@example.com', 'plugin-audit', { kind: 'waitlist' } )

        const stable = [app( 'stable', 'native' ), ...catalog( 200 )]
        await check( [...stable, app( 'editor', 'rosetta' ), app( 'mixer', 'unreported' ), app( 'legacy', 'no' )] )
        const updated = [...stable, app( 'editor', 'native' ), app( 'mixer', 'rosetta' ), app( 'newcomer', 'rosetta' )]
        const report = await check( updated )
        const repeated = await check( updated )

        expect( report ).toMatchObject( { changes: 4, notifications: 4, deliveries: { dryRun: 4, pending: 0 } } )
        expect( repeated ).toMatchObject( { changes: 0, notifications: 0, deliveries: { dryRun: 0, pending: 0 } } )
        expect( changes() ).toEqual( [
            { app_key: 'editor', previous_status: 'rosetta', current_status: 'native' },
            { app_key: 'legacy', previous_status: 'no', current_status: null },
            { app_key: 'mixer', previous_status: 'unreported', current_status: 'rosetta' },
            { app_key: 'newcomer', previous_status: null, current_status: 'rosetta' }
        ] )
        expect( deliveries() ).toEqual( [
            { app_key: 'editor', email: 'another-editor@example.com', state: 'dry-run' },
            { app_key: 'editor', email: 'editor@example.com', state: 'dry-run' },
            { app_key: 'mixer', email: 'mixer@example.com', state: 'dry-run' },
            { app_key: 'newcomer', email: 'newcomer@example.com', state: 'dry-run' }
        ] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'refuses a 50-app response against 3,000 apps, keeps the snapshot and notifies once for a later status change', async () => {
        const full = catalog( 3000 )
        for ( let index = 0; index < 500; index++ ) {
            subscribe( `subscriber-${index}@example.com`, `app-${index * 6}` )
        }
        await check( full, liveSettings )
        const baselineTime = now

        const partial = await check( full.slice( 0, 50 ), liveSettings )

        expect( partial ).toMatchObject( {
            changes: 0, notifications: 0,
            observation: { status: 'refused', reason: 'catalog-shrank', incomingCount: 50, previousCount: 3000, changedCount: 2950 },
            deliveries: { accepted: 0, pending: 0, skipped: true }
        } )
        expect( sqlite.prepare( `
            SELECT previous_count, incoming_count, changed_count, reason FROM rosetta_observations WHERE status = 'refused'
        ` ).get() ).toEqual( { previous_count: 3000, incoming_count: 50, changed_count: 2950, reason: 'catalog-shrank' } )
        expect( sqlite.prepare( 'SELECT observed_at FROM rosetta_snapshot_state' ).get().observed_at ).toBe( baselineTime )
        expect( sqlite.prepare( 'SELECT COUNT(*) AS count FROM rosetta_app_snapshot' ).get().count ).toBe( 3000 )

        const recovered = await check( full, liveSettings )

        expect( recovered ).toMatchObject( { changes: 0, notifications: 0, observation: { status: 'accepted' } } )
        expect( changes() ).toEqual( [] )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()

        full[0] = app( 'app-0', 'native' )
        expect( await check( full, liveSettings ) ).toMatchObject( {
            changes: 1, notifications: 1, observation: { status: 'accepted', changedCount: 1 }, deliveries: { accepted: 1 }
        } )
        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
    } )

    it( 'requires a second silent approval when restoring a silently approved catalog shrink', async () => {
        baseline.minimum = null
        const full = catalog( 3084 )
        for ( let index = 0; index < 500; index++ ) {
            subscribe( `subscriber-${index}@example.com`, `app-${index + 50}` )
        }
        await check( full, liveSettings )

        const partial = await check( full.slice( 0, 50 ), liveSettings )
        const partialPath = reviewPath( partial.observation.id )
        expect( await ( await adminRequest( partialPath ) ).json() ).toMatchObject( {
            reason: 'catalog-shrank', additionCount: 0, removalCount: 3034,
            canNotify: false, notificationCount: 0, acceptAndNotifyCommand: null
        } )
        expect( ( await adminRequest( `${partialPath}&notify=0&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( sqlite.prepare( 'SELECT app_count FROM rosetta_snapshot_state' ).get().app_count ).toBe( 3084 )
        expect( await ( await adminRequest( partialPath, 'POST' ) ).json() ).toMatchObject( {
            resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( sqlite.prepare( 'SELECT app_count FROM rosetta_snapshot_state' ).get().app_count ).toBe( 50 )

        now += 24 * 60 * 60 * 1000
        const restored = await check( full, liveSettings )
        expect( restored.observation ).toMatchObject( { status: 'refused', reason: 'too-many-changes' } )
        const restoredPath = reviewPath( restored.observation.id )
        expect( await ( await adminRequest( restoredPath ) ).json() ).toMatchObject( {
            reason: 'too-many-changes', additionCount: 3034, removalCount: 0,
            canNotify: true, notificationCount: 0
        } )
        expect( ( await adminRequest( `${restoredPath}&notify=500&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( await ( await adminRequest( restoredPath, 'POST' ) ).json() ).toMatchObject( {
            resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( await check( full, liveSettings ) ).toMatchObject( { changes: 0, notifications: 0 } )
        expect( sqlite.prepare( 'SELECT app_count FROM rosetta_snapshot_state' ).get().app_count ).toBe( 3084 )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'records a recent unchanged return without sending email', async () => {
        const full = catalog( 100 )
        const reduced = full.slice( 1 )
        subscribe( 'subscriber@example.com', 'app-0' )
        await check( full, liveSettings )
        await check( reduced, liveSettings )

        now += 10 * 24 * 60 * 60 * 1000
        expect( await check( full, liveSettings ) ).toMatchObject( { changes: 1, notifications: 0 } )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it.each( ['an automatic check', 'a reviewed update'] )( 'emails both statuses for a recent return through %s', async path => {
        const full = catalog( 100 )
        const reduced = full.slice( 1 )
        const updated = [...full]
        updated[0] = app( 'app-0', 'native' )
        subscribe( 'subscriber@example.com', 'app-0' )
        await check( full, liveSettings )
        await check( reduced, liveSettings )
        now += 10 * 24 * 60 * 60 * 1000

        if ( path === 'a reviewed update' ) {
            updated[1] = app( 'app-1', 'native' )
            updated[2] = app( 'app-2', 'native' )
            const refused = await check( updated, liveSettings )
            expect( refused.observation ).toMatchObject( { status: 'refused', reason: 'too-many-changes' } )
            const review = reviewPath( refused.observation.id )
            const preview = await ( await adminRequest( review ) ).json()
            expect( preview ).toMatchObject( { additionCount: 1, notificationCount: 1 } )
            expect( preview.changes ).toContainEqual( {
                appKey: 'app-0', appName: 'app-0', previousStatus: 'rosetta', currentStatus: 'native'
            } )
            expect( await ( await adminRequest( `${review}&notify=1&mode=live`, 'POST' ) ).json() ).toMatchObject( {
                resolution: 'notify', changes: 3, notifications: 1
            } )
        } else {
            expect( await check( updated, liveSettings ) ).toMatchObject( { changes: 1, notifications: 1 } )
        }

        await check( updated, liveSettings )
        expect( changes() ).toContainEqual( { app_key: 'app-0', previous_status: 'rosetta', current_status: 'native' } )
        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        const message = JSON.parse( sendEmail.mock.calls[0][1].body )
        expect( message.text ).toContain( 'Requires Rosetta 2 to Native Apple Silicon support' )
    } )

    it.each( [30, 31] )( 'treats a return after %i days as an addition and prunes its history', async days => {
        const full = catalog( 100 )
        subscribe( 'subscriber@example.com', 'app-0' )
        await check( full, liveSettings )
        const lastSeenAt = now
        await check( full.slice( 1 ), liveSettings )

        now = lastSeenAt + days * 24 * 60 * 60 * 1000 - 1000
        expect( await check( full, liveSettings ) ).toMatchObject( { changes: 1, notifications: 1 } )
        expect( sqlite.prepare( 'SELECT COUNT(*) AS count FROM rosetta_removed_apps' ).get().count ).toBe( 0 )
        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        const message = JSON.parse( sendEmail.mock.calls[0][1].body )
        expect( message.text ).toContain( 'app-0 was added to Does It ARM.' )
    } )

    it( 'lets an operator accept a persistent bulk update silently by default', async () => {
        const full = catalog( 100 )
        subscribe( 'watching@example.com', 'app-0' )
        await check( full, liveSettings )
        const changed = full.map( ( row, index ) => ( { ...row, status: index < 5 ? 'native' : row.status } ) )

        const earlier = await check( changed, liveSettings )
        expect( earlier ).toMatchObject( {
            changes: 0, notifications: 0,
            observation: { status: 'refused', reason: 'too-many-changes', incomingCount: 100, previousCount: 100, changedCount: 5 }
        } )

        now += 86400000
        loadFeed.mockResolvedValueOnce( Response.json( changed ) )
        const refused = await adminRequest( 'check-rosetta', 'POST' )
        expect( refused.status ).toBe( 409 )
        const { observation, recovery } = await refused.json()
        const path = reviewPath( observation.id )
        expect( observation ).toMatchObject( { status: 'refused', changedCount: 5 } )
        expect( recovery.reviewCommand ).toBe(
            `curl -sS -X GET -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" 'https://doesitarm.com/api/subscriptions/${path}'`
        )
        expect( ( await adminRequest( reviewPath( earlier.observation.id ) ) ).status ).toBe( 404 )
        expect( ( await adminRequest( path, 'GET', null ) ).status ).toBe( 401 )
        expect( ( await adminRequest( path, 'POST', 'wrong-secret' ) ).status ).toBe( 401 )

        const preview = await adminRequest( path )
        expect( await preview.json() ).toMatchObject( { canNotify: true, notificationCount: 1, changes: [
            { appKey: 'app-0', previousStatus: 'rosetta', currentStatus: 'native' },
            { appKey: 'app-1' }, { appKey: 'app-2' }, { appKey: 'app-3' }, { appKey: 'app-4' }
        ] } )
        expect( await ( await adminRequest( path, 'POST' ) ).json() ).toMatchObject( {
            ok: true, resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( await check( changed, liveSettings ) ).toMatchObject( {
            changes: 0, observation: { status: 'accepted' }
        } )
        expect( changes() ).toEqual( [] )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'requires the reviewed email count and queues a 446-app update once for the right subscribers', async () => {
        baseline.minimum = null
        const full = catalog( 3084 )
        subscribe( 'watching@example.com', 'app-0' )
        subscribe( 'second@example.com', 'app-445' )
        subscribe( 'opts-out@example.com', 'app-445' )
        subscribe( 'unconfirmed@example.com', 'app-1', { confirmedAt: null } )
        subscribe( 'unchanged@example.com', 'app-446' )
        const changed = full.map( ( row, index ) => ( { ...row, status: index < 446 ? 'native' : row.status } ) )
        await check( full, liveSettings )

        const refused = await check( changed, liveSettings )
        expect( refused.observation ).toMatchObject( { status: 'refused', reason: 'too-many-changes', changedCount: 446 } )
        const path = reviewPath( refused.observation.id )
        subscribe( 'late@example.com', 'app-0', { confirmedAt: new Date( now + 1000 ).toISOString() } )
        const firstPreview = await ( await adminRequest( path ) ).json()
        expect( firstPreview.notificationCount ).toBe( 3 )
        expect( firstPreview.changes ).toHaveLength( 446 )

        sqlite.prepare( "UPDATE interest_subscriptions SET unsubscribed_at = ? WHERE email = 'opts-out@example.com'" )
            .run( new Date( now ).toISOString() )
        expect( ( await adminRequest( `${path}&notify=3&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( deliveries() ).toEqual( [] )

        const preview = await ( await adminRequest( path ) ).json()
        expect( preview ).toMatchObject( { notificationCount: 2, mode: 'live' } )
        expect( preview.acceptAndNotifyCommand ).toContain( `${path}&notify=2&mode=live'` )
        const dryRunPreview = await ( await adminRequest( path, 'GET', undefined, {} ) ).json()
        expect( dryRunPreview.acceptAndNotifyCommand ).toContain( `${path}&notify=2&mode=dry-run'` )
        expect( ( await adminRequest( `${path}&notify=2&mode=dry-run`, 'POST' ) ).status ).toBe( 409 )
        const approve = () => adminRequest( `${path}&notify=2&mode=live`, 'POST' )
        const approvals = await Promise.all( [approve(), approve()] )
        expect( approvals.map( response => response.status ).sort() ).toEqual( [200, 409] )
        expect( await approvals.find( response => response.ok ).json() ).toMatchObject( {
            resolution: 'notify', changes: 446, notifications: 2
        } )

        expect( await check( changed, liveSettings ) ).toMatchObject( { changes: 0, deliveries: { accepted: 2, pending: 0 } } )
        await check( changed, liveSettings )
        expect( deliveries() ).toEqual( [
            { app_key: 'app-0', email: 'watching@example.com', state: 'accepted' },
            { app_key: 'app-445', email: 'second@example.com', state: 'accepted' }
        ] )
        expect( sendEmail ).toHaveBeenCalledTimes( 2 )
    } )

    it( 'invalidates a review if an overlapping check updates its baseline', async () => {
        const full = catalog( 100 )
        subscribe( 'watching@example.com', 'app-0' )
        await check( full, liveSettings )

        const earlier = Promise.withResolvers()
        now += 1000
        loadFeed.mockReturnValueOnce( earlier.promise )
        const olderCheck = runRosettaCheck( { SUBSCRIPTIONS_DB: database, ...liveSettings } )
        const changed = full.map( ( row, index ) => ( { ...row, status: index < 5 ? 'native' : row.status } ) )
        const refused = await check( changed, liveSettings )
        const path = reviewPath( refused.observation.id )
        expect( await ( await adminRequest( path ) ).json() ).toMatchObject( { notificationCount: 1 } )

        const earlierCatalog = full.map( ( row, index ) => index === 50 ? { ...row, status: 'native' } : row )
        earlier.resolve( Response.json( earlierCatalog ) )
        expect( await olderCheck ).toMatchObject( { changes: 1, observation: { status: 'accepted' } } )
        expect( ( await adminRequest( `${path}&notify=1&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( deliveries() ).toEqual( [] )
    } )

    it( 'lets an authenticated operator seed an undersized baseline and later approve its expansion silently', async () => {
        baseline.minimum = null
        const small = catalog( 50 )
        subscribe( 'watching@example.com', 'app-50' )
        loadFeed.mockResolvedValueOnce( Response.json( small ) )
        now += 1000
        const refused = await adminRequest( 'check-rosetta', 'POST' )
        expect( refused.status ).toBe( 409 )
        const { observation, recovery } = await refused.json()
        expect( observation ).toMatchObject( {
            status: 'refused', reason: 'initial-catalog-too-small', incomingCount: 50, previousCount: 0, reviewable: 1
        } )
        const path = reviewPath( observation.id )
        expect( recovery.reviewCommand ).toContain( path )
        expect( ( await adminRequest( path, 'GET', null ) ).status ).toBe( 401 )
        expect( ( await adminRequest( path, 'POST', null ) ).status ).toBe( 401 )
        expect( await ( await adminRequest( path ) ).json() ).toMatchObject( {
            reason: 'initial-catalog-too-small', additionCount: 50, removalCount: 0,
            canNotify: false, notificationCount: 0, acceptAndNotifyCommand: null
        } )
        expect( ( await adminRequest( `${path}&notify=0&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( sqlite.prepare( 'SELECT app_count, observed_at FROM rosetta_snapshot_state' ).get() )
            .toEqual( { app_count: 0, observed_at: 0 } )

        expect( await ( await adminRequest( path, 'POST' ) ).json() ).toMatchObject( {
            resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( sqlite.prepare( 'SELECT app_count FROM rosetta_snapshot_state' ).get().app_count ).toBe( 50 )
        expect( await check( small, liveSettings ) ).toMatchObject( { changes: 0, observation: { status: 'accepted' } } )

        const full = catalog( rosettaBaselineMinimum )
        const expanded = await check( full, liveSettings )
        expect( expanded.observation ).toMatchObject( { status: 'refused', reason: 'too-many-changes' } )
        const expandedPath = reviewPath( expanded.observation.id )
        expect( await ( await adminRequest( expandedPath ) ).json() ).toMatchObject( {
            additionCount: full.length - small.length, removalCount: 0, notificationCount: 1
        } )
        expect( await ( await adminRequest( expandedPath, 'POST' ) ).json() ).toMatchObject( {
            resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( await check( full, liveSettings ) ).toMatchObject( { changes: 0, observation: { status: 'accepted' } } )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'keeps the first automatic baseline threshold', async () => {
        baseline.minimum = null
        const full = catalog( rosettaBaselineMinimum )
        expect( await check( full.slice( 0, -1 ) ) ).toMatchObject( {
            observation: { status: 'refused', reason: 'initial-catalog-too-small' }
        } )
        expect( await check( full ) ).toMatchObject( { changes: 0, notifications: 0, observation: { status: 'accepted' } } )
    } )

    it( 'leaves a first catalog with no usable listings unreviewable', async () => {
        const duplicate = [app( 'editor', 'rosetta' ), app( 'editor', 'native' )]
        const refused = await check( duplicate )

        expect( refused.observation ).toMatchObject( {
            status: 'refused', reason: 'initial-catalog-too-small', incomingCount: 0, reviewable: 0
        } )
        expect( ( await adminRequest( reviewPath( refused.observation.id ), 'POST' ) ).status ).toBe( 409 )
    } )

    it.each( [ 'all', 'one' ] )( 'requires silent recovery after deleting %s snapshot rows by hand', async deleted => {
        const full = catalog( 100 )
        subscribe( 'watching@example.com', 'app-0' )
        await check( full, liveSettings )
        sqlite.exec( deleted === 'all' ? 'DELETE FROM rosetta_app_snapshot'
            : "DELETE FROM rosetta_app_snapshot WHERE app_key = 'app-0'" )

        const refused = await check( full, liveSettings )
        expect( refused.observation ).toMatchObject( {
            status: 'refused', reason: 'snapshot-incomplete', previousCount: 100
        } )
        const path = reviewPath( refused.observation.id )
        expect( await ( await adminRequest( path ) ).json() ).toMatchObject( {
            canNotify: false, notificationCount: 0, acceptAndNotifyCommand: null
        } )
        expect( ( await adminRequest( `${path}&notify=0&mode=live`, 'POST' ) ).status ).toBe( 409 )
        expect( await ( await adminRequest( path, 'POST' ) ).json() ).toMatchObject( {
            resolution: 'silent', changes: 0, notifications: 0
        } )
        expect( await check( full, liveSettings ) ).toMatchObject( { changes: 0, observation: { status: 'accepted' } } )
        expect( sqlite.prepare( 'SELECT COUNT(*) AS count FROM rosetta_app_snapshot' ).get().count ).toBe( 100 )
        expect( deliveries() ).toEqual( [] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'keeps the latest observation when overlapping checks finish out of order', async () => {
        subscribe( 'editor@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )] )

        const earlier = Promise.withResolvers()
        now += 1000
        loadFeed.mockReturnValueOnce( earlier.promise )
        const olderCheck = runRosettaCheck( { SUBSCRIPTIONS_DB: database } )

        await check( [app( 'editor', 'native' )] )
        earlier.resolve( Response.json( [app( 'editor', 'rosetta' )] ) )

        expect( await olderCheck ).toMatchObject( { changes: 0, notifications: 0, observation: { status: 'superseded' } } )
        expect( changes() ).toHaveLength( 1 )
        expect( deliveries() ).toHaveLength( 1 )
        expect( sqlite.prepare( 'SELECT status FROM rosetta_app_snapshot' ).get().status ).toBe( 'native' )
    } )

    it( 'claims a live delivery once across overlapping checks and includes scoped unsubscribe details', async () => {
        const token = subscribe( 'editor@example.com', 'editor' )
        const status = [app( 'editor', 'native', 'Editor' )]
        await check( [app( 'editor', 'rosetta', 'Editor' )], liveSettings )

        await Promise.all( [check( status, liveSettings ), check( status, liveSettings )] )
        await check( status, liveSettings )

        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        const [url, options] = sendEmail.mock.calls[0]
        const message = JSON.parse( options.body )
        const unsubscribe = `https://doesitarm.com/api/subscriptions/unsubscribe?token=${token}`
        expect( url ).toBe( emailUrl )
        expect( options.headers.Authorization ).toBe( 'Bearer fake-email-token' )
        expect( message ).toMatchObject( {
            from: { address: 'updates@example.com', name: 'Does It ARM' },
            to: 'editor@example.com',
            subject: 'Does It ARM update for Editor',
            headers: {
                'List-Unsubscribe': `<${unsubscribe}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
        } )
        expect( message.text ).toContain( 'Requires Rosetta 2 to Native Apple Silicon support' )
        expect( message.text ).toContain( 'https://doesitarm.com/app/editor' )
        expect( message.text ).toContain( unsubscribe )
        expect( message.text ).toContain( liveSettings.ROSETTA_MAILING_ADDRESS )
        expect( deliveries() ).toEqual( [{ app_key: 'editor', email: 'editor@example.com', state: 'accepted' }] )
        expect( sqlite.prepare( 'SELECT provider_message_id FROM rosetta_notifications' ).get().provider_message_id )
            .toBe( '<test@example.com>' )
    } )

    it( 'writes the email text for an added app', async () => {
        const full = catalog( 100 )
        await check( full, liveSettings )
        subscribe( 'editor@example.com', 'editor' )

        await check( [...full, app( 'editor', 'rosetta', 'Editor' )], liveSettings )

        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        const message = JSON.parse( sendEmail.mock.calls[0][1].body )
        expect( message.text ).toContain( 'Editor was added to Does It ARM. Its listed status is Requires Rosetta 2.' )
        expect( message.text ).toContain( 'https://doesitarm.com/app/editor' )
    } )

    it( 'cancels removal emails already in the queue', async () => {
        subscribe( 'editor@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )], liveSettings )
        const { lastInsertRowid } = sqlite.prepare( `
            INSERT INTO rosetta_app_changes (app_key, app_name, previous_status, observed_at)
            VALUES ('editor', 'Editor', 'rosetta', ?)
        ` ).run( now )
        sqlite.prepare( `
            INSERT INTO rosetta_notifications (change_id, subscription_id, subscription_created_at, mode)
            SELECT ?, id, created_at, 'live' FROM interest_subscriptions
        ` ).run( lastInsertRowid )

        await check( [app( 'editor', 'rosetta' )], liveSettings )

        expect( deliveries() ).toEqual( [{ app_key: 'editor', email: 'editor@example.com', state: 'cancelled' }] )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'stops pending delivery after opt-out, including when the address subscribes again', async () => {
        subscribe( 'editor@example.com', 'editor' )
        subscribe( 'stays-unsubscribed@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )], liveSettings )
        sendEmail.mockResolvedValueOnce( new Response( null, { status: 429 } ) )
        const status = [app( 'editor', 'native' )]

        expect( await check( status, liveSettings ) ).toMatchObject( { deliveries: { rateLimited: true, pending: 2 } } )
        now += 1000
        sqlite.prepare( 'UPDATE interest_subscriptions SET unsubscribed_at = ?' ).run( new Date( now ).toISOString() )
        sqlite.prepare( `
            UPDATE interest_subscriptions SET created_at = ?, unsubscribed_at = NULL, confirmed_at = NULL,
                unsubscribe_token = ? WHERE email = ?
        ` ).run( new Date( now ).toISOString(), crypto.randomUUID(), 'editor@example.com' )
        sendEmail.mockClear()

        expect( await check( status, liveSettings ) ).toMatchObject( { deliveries: { pending: 0 } } )
        expect( sendEmail ).not.toHaveBeenCalled()
        expect( deliveries().map( job => job.state ) ).toEqual( ['cancelled', 'cancelled'] )
    } )

    it( 'only simulates previously queued dry-run mail after live sending is enabled', async () => {
        for ( let index = 0; index < 21; index++ ) {
            subscribe( `editor-${index}@example.com`, 'editor' )
        }
        await check( [app( 'editor', 'rosetta' )] )
        const status = [app( 'editor', 'native' )]

        expect( await check( status ) ).toMatchObject( { notifications: 21, deliveries: { dryRun: 20, pending: 1 } } )
        expect( await check( status, liveSettings ) ).toMatchObject( { notifications: 0, deliveries: { dryRun: 1, pending: 0 } } )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'disables live sending when the launch switch is off', async () => {
        launch.enabled = false
        subscribe( 'editor@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )], liveSettings )

        expect( await check( [app( 'editor', 'native' )], liveSettings ) ).toMatchObject( {
            mode: 'dry-run', deliveries: { dryRun: 1, pending: 0 }
        } )
        expect( sendEmail ).not.toHaveBeenCalled()
    } )

    it( 'does not retry a send with an ambiguous provider outcome', async () => {
        subscribe( 'editor@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )], liveSettings )
        sendEmail.mockRejectedValueOnce( new Error( 'Connection closed after request.' ) )
        const status = [app( 'editor', 'native' )]

        expect( await check( status, liveSettings ) ).toMatchObject( { deliveries: { needsReview: 1, pending: 0 } } )
        await check( status, liveSettings )

        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        expect( deliveries()[0].state ).toBe( 'needs-review' )
    } )

    it( 'reports a blocked sender and leaves its delivery pending', async () => {
        subscribe( 'editor@example.com', 'editor' )
        await check( [app( 'editor', 'rosetta' )], liveSettings )
        sendEmail.mockResolvedValueOnce( new Response( null, { status: 403 } ) )
        const status = [app( 'editor', 'native' )]

        expect( await check( status, liveSettings ) ).toMatchObject( { deliveries: { blocked: true, accepted: 0, pending: 1 } } )
        expect( deliveries()[0].state ).toBe( 'pending' )

        expect( await check( status, liveSettings ) ).toMatchObject( { notifications: 0, deliveries: { blocked: false, accepted: 1, pending: 0 } } )
        expect( sendEmail ).toHaveBeenCalledTimes( 2 )
    } )

    it( 'keeps skipped apps in the snapshot and processes a legitimate change from the same observation', async () => {
        const full = catalog( 100 )
        subscribe( 'broken@example.com', 'app-0' )
        subscribe( 'changed@example.com', 'app-1' )
        await check( full, liveSettings )

        const updated = [...full]
        updated[0] = { ...updated[0], endpoint: '/app/invalid_slug' }
        updated[1] = { ...updated[1], status: 'native' }
        expect( await check( updated, liveSettings ) ).toMatchObject( {
            changes: 1, notifications: 1, observation: { status: 'accepted', badRows: 1 }
        } )
        updated[0] = { ...full[0], name: '' }
        expect( await check( updated, liveSettings ) ).toMatchObject( {
            changes: 0, notifications: 0, observation: { status: 'accepted', badRows: 1 }
        } )
        updated[0] = full[0]
        expect( await check( [app( 'app-0', 'native' ), ...updated], liveSettings ) ).toMatchObject( {
            changes: 0, notifications: 0, observation: { status: 'accepted', badRows: 1 }
        } )
        expect( await check( updated, liveSettings ) ).toMatchObject( { changes: 0, notifications: 0 } )
        expect( sendEmail ).toHaveBeenCalledTimes( 1 )
        expect( sqlite.prepare( "SELECT status FROM rosetta_app_snapshot WHERE app_key = 'app-0'" ).get().status ).toBe( 'rosetta' )
    } )

    it( 'keeps the last good snapshot when the API returns empty or malformed data', async () => {
        await check( [app( 'editor', 'rosetta' )] )

        expect( await check( [] ) ).toMatchObject( {
            observation: { status: 'refused', reason: 'invalid-catalog', previousCount: 1, incomingCount: 0, badRows: 0 }
        } )
        expect( await check( [app( 'editor', 'unexpected' )] ) ).toMatchObject( {
            observation: { status: 'refused', reason: 'too-many-bad-rows', previousCount: 1, incomingCount: 0, badRows: 1 }
        } )

        expect( await check( [app( 'editor', 'native' )] ) ).toMatchObject( { changes: 1 } )
        expect( changes() ).toEqual( [{ app_key: 'editor', previous_status: 'rosetta', current_status: 'native' }] )
    } )
} )

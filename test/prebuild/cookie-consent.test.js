import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

import { initCookieConsent } from '../../helpers/cookie-consent-browser.js'
import { cookieChoiceKey, cookieRegionPath, requiresCookieConsent, shouldLoadOptionalTracking } from '../../helpers/cookie-consent.js'
import frontend from '../../workers/frontend/index.js'

vi.mock( '@astrojs/cloudflare/handler', () => ( { handle: vi.fn() } ) )

describe( 'cookie consent region', () => {
    it.each( [ 'GB', 'CH', 'NO', 'IS', 'LI', 'XX', 'T1', '', undefined ] )( 'requires consent for %s', country => {
        expect( requiresCookieConsent( { country } ) ).toBe( true )
    } )

    it( 'uses the EU flag and allows known countries outside the protected region', () => {
        expect( requiresCookieConsent( { isEUCountry: '1', country: 'DE' } ) ).toBe( true )
        expect( requiresCookieConsent( { country: 'US' } ) ).toBe( false )
        expect( requiresCookieConsent( { country: 'CA', isEUCountry: null } ) ).toBe( false )
        expect( requiresCookieConsent() ).toBe( true )
    } )

    it( 'returns an uncacheable decision from Worker metadata without the scanner binding', async () => {
        const request = new Request( `https://doesitarm.com${ cookieRegionPath }`, { headers: { 'CF-IPCountry': 'US' } } )
        request.cf = { country: 'FR', isEUCountry: '1' }
        const response = await frontend.fetch( request, {}, {} )
        expect( response.headers.get( 'Cache-Control' ) ).toBe( 'no-store' )
        expect( response.headers.get( 'Cloudflare-CDN-Cache-Control' ) ).toBe( 'no-store' )
        expect( await response.json() ).toEqual( { consentRequired: true } )
    } )
} )

describe( 'optional tracking', () => {
    function createPage ( decision, savedChoice, search = '' ) {
        const { window } = new JSDOM( `
            <aside id="cookie-consent" data-measurement-id="G-TEST" hidden>
                <button data-cookie-choice="accept">Accept</button>
                <button data-cookie-choice="reject">Reject</button>
            </aside>
            <doesitarm-carbon-ad></doesitarm-carbon-ad>
            <button data-cookie-settings hidden>Cookie settings</button>
        `, { url: `https://doesitarm.com/${ search }` } )
        window.AbortSignal = AbortSignal
        window.fetch = vi.fn( async () => {
            if ( decision === undefined ) throw new Error( 'No region response' )
            return Response.json( { consentRequired: decision } )
        } )
        if ( savedChoice ) window.localStorage.setItem( cookieChoiceKey, savedChoice )
        const { document } = window
        return {
            window,
            banner: document.getElementById( 'cookie-consent' ),
            settings: document.querySelector( '[data-cookie-settings]' ),
            scripts: () => Array.from( document.scripts, script => new URL( script.src ).hostname ),
        }
    }

    it( 'requires an explicit accept when consent is required or unknown', () => {
        expect( shouldLoadOptionalTracking( true, 'accept' ) ).toBe( true )
        expect( shouldLoadOptionalTracking( true, 'reject' ) ).toBe( false )
        expect( shouldLoadOptionalTracking( undefined, null ) ).toBe( false )
        expect( shouldLoadOptionalTracking( false, null ) ).toBe( true )
    } )

    it( 'blocks both scripts on unknown region and remembers rejection', async () => {
        const page = createPage()
        await initCookieConsent( page.window )
        expect( page.banner.hidden ).toBe( false )
        expect( page.scripts() ).toEqual( [] )
        expect( page.window.gtag ).toBeUndefined()
        page.banner.querySelector( '[data-cookie-choice="reject"]' ).click()
        expect( page.banner.hidden ).toBe( true )
        expect( page.window.localStorage.getItem( cookieChoiceKey ) ).toBe( 'reject' )
        expect( page.scripts() ).toEqual( [] )
        page.window.close()
    } )

    it( 'reopens settings and queues Consent Mode v2 before loading tags', async () => {
        const page = createPage( true, 'reject' )
        await initCookieConsent( page.window )
        expect( page.banner.hidden ).toBe( true )
        expect( page.scripts() ).toEqual( [] )
        page.settings.click()
        expect( page.banner.hidden ).toBe( false )
        const accept = page.banner.querySelector( '[data-cookie-choice="accept"]' )
        expect( page.window.document.activeElement ).toBe( accept )
        accept.click()
        expect( page.window.localStorage.getItem( cookieChoiceKey ) ).toBe( 'accept' )
        expect( page.scripts() ).toEqual( [ 'www.googletagmanager.com', 'cdn.carbonads.com' ] )
        const [ defaults, update ] = page.window.dataLayer.map( command => Array.from( command ) )
        expect( defaults ).toEqual( [ 'consent', 'default', {
            ad_storage: 'denied', analytics_storage: 'denied',
            ad_user_data: 'denied', ad_personalization: 'denied'
        } ] )
        expect( update ).toEqual( [ 'consent', 'update', { ...defaults[2], analytics_storage: 'granted' } ] )
        page.window.close()
    } )

    it.each( [ [ 'accept', null ], [ 'reject', 'accept' ] ] )( 'previews a %s click with saved choice %s without enabling tracking', async ( action, savedChoice ) => {
        const page = createPage( false, savedChoice, '?cookie-banner=preview' )
        const { window, banner, settings } = page
        window.document.cookie = '_ga=previous; Path=/'
        await initCookieConsent( window )
        expect( window.fetch ).not.toHaveBeenCalled()
        expect( banner.hidden ).toBe( false )
        expect( settings.hidden ).toBe( false )
        banner.querySelector( `[data-cookie-choice="${ action }"]` ).click()
        expect( banner.hidden ).toBe( true )
        expect( window.localStorage.getItem( cookieChoiceKey ) ).toBe( savedChoice )
        expect( window.document.cookie ).toBe( '_ga=previous' )
        settings.click()
        expect( banner.hidden ).toBe( false )
        expect( page.scripts() ).toEqual( [] )
        expect( window.dataLayer ).toBeUndefined()
        expect( window.diaOptionalTrackingAllowed ).toBeUndefined()
        window.close()
    } )

    it.each( [ [ true, 'accept' ], [ false, null ] ] )( 'loads immediately after the region decision (%s, %s)', async ( decision, choice ) => {
        const page = createPage( decision, choice )
        await initCookieConsent( page.window )
        expect( page.banner.hidden ).toBe( true )
        expect( page.settings.hidden ).toBe( !decision )
        expect( page.scripts() ).toEqual( [ 'www.googletagmanager.com', 'cdn.carbonads.com' ] )
        page.window.close()
    } )
} )

import { cookieChoiceKey, cookieRegionPath, shouldLoadOptionalTracking } from './cookie-consent.js'

const googleDenied = {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
}

function queueGoogleTag ( window ) {
    window.dataLayer ||= []
    return function gtag () {
        window.dataLayer.push( arguments )
    }
}

function loadOptionalTracking ( window, measurementId, gtag, consentRequired ) {
    const { document } = window
    window.gtag = gtag
    if ( consentRequired ) {
        // Carbon Ads consent does not grant Google's advertising permissions.
        gtag( 'consent', 'update', { ...googleDenied, analytics_storage: 'granted' } )
    }
    gtag( 'js', new Date() )
    gtag( 'config', measurementId )

    const tag = document.createElement( 'script' )
    tag.async = true
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${ encodeURIComponent( measurementId ) }`
    document.head.append( tag )

    window.customElements.define( 'doesitarm-carbon-ad', class extends window.HTMLElement {
        connectedCallback () {
            if ( document.getElementById( '_carbonads_js' ) ) return

            const script = document.createElement( 'script' )
            script.id = '_carbonads_js'
            script.async = true
            script.src = 'https://cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom'
            this.append( script )
        }
    } )

    window.diaOptionalTrackingAllowed = true
    document.dispatchEvent( new window.Event( 'dia-optional-tracking' ) )
}

function clearAnalyticsCookies ( document, measurementId ) {
    try {
        for ( const name of [ '_ga', `_ga_${ measurementId.slice( 2 ) }` ] ) {
            const expired = `${ name }=; Max-Age=0; Path=/`
            document.cookie = expired
            document.cookie = `${ expired }; Domain=doesitarm.com`
        }
    } catch {}
}

async function regionRequiresConsent ( window ) {
    try {
        const response = await window.fetch( cookieRegionPath, {
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            signal: window.AbortSignal.timeout( 3000 )
        } )
        if ( response.ok ) return ( await response.json() )?.consentRequired !== false
    } catch {}
    return true
}

export async function initCookieConsent ( window ) {
    const { document } = window
    const banner = document.getElementById( 'cookie-consent' )
    const settings = document.querySelector( '[data-cookie-settings]' )
    const { measurementId } = banner.dataset
    const preview = new URLSearchParams( window.location.search ).get( 'cookie-banner' ) === 'preview'
    const consentRequired = preview || await regionRequiresConsent( window )
    const gtag = preview ? null : queueGoogleTag( window )
    if ( consentRequired ) gtag?.( 'consent', 'default', googleDenied )

    let trackingStarted = false
    let choice = null
    let openedFromSettings = false

    function readChoice () {
        try { return window.localStorage.getItem( cookieChoiceKey ) } catch { return choice }
    }

    function applyChoice ( value ) {
        choice = value === 'accept' || value === 'reject' ? value : null
        banner.hidden = !consentRequired || choice !== null
        if ( preview ) return
        const allowed = shouldLoadOptionalTracking( consentRequired, choice )

        if ( allowed && !trackingStarted ) {
            trackingStarted = true
            loadOptionalTracking( window, measurementId, gtag, consentRequired )
        } else if ( !allowed && ( trackingStarted || choice === 'reject' ) ) {
            if ( trackingStarted ) {
                window.diaOptionalTrackingAllowed = false
                window[`ga-disable-${ measurementId }`] = true
            }
            clearAnalyticsCookies( document, measurementId )
            // Reload to discard the running Carbon script as well as the Google tag.
            if ( trackingStarted ) window.location.reload()
        }
    }

    applyChoice( preview ? null : readChoice() )
    if ( !consentRequired ) return

    settings.hidden = false
    settings.addEventListener( 'click', () => {
        openedFromSettings = true
        banner.hidden = false
        banner.querySelector( '[data-cookie-choice]' ).focus()
    } )

    for ( const button of banner.querySelectorAll( '[data-cookie-choice]' ) ) {
        button.addEventListener( 'click', () => {
            const value = button.dataset.cookieChoice
            if ( !preview ) {
                try { window.localStorage.setItem( cookieChoiceKey, value ) } catch {}
            }
            applyChoice( value )
            if ( openedFromSettings ) settings.focus( { preventScroll: true } )
            openedFromSettings = false
        } )
    }

    if ( preview ) return

    window.addEventListener( 'storage', event => {
        if ( event.key === cookieChoiceKey || event.key === null ) applyChoice( readChoice() )
    } )
    window.addEventListener( 'pageshow', event => {
        if ( event.persisted ) applyChoice( readChoice() )
    } )
}

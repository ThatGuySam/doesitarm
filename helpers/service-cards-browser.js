// Browser side of the service cards: impressions, clicks, form submits and Turnstile.
// Events carry the card type, headline variant, experiment, control, page path and
// a random anonymous browser id (no IP, user agent or email).

let started = false
let eventsUrl = ''
let siteKey = ''
const seen = new WeakSet()
// Vue hydration can swap a card for a copy, so count one impression per card type per page view
const impressionsSent = new Set()

const idPattern = /^[a-z0-9-]{1,40}$/
const browserKey = 'dia-svc-browser'
let pageBrowserId = ''

function makeRandomId () {
    if ( typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ) return crypto.randomUUID()

    return Array.from( { length: 32 }, () => Math.floor( Math.random() * 16 ).toString( 16 ) ).join( '' )
}

// One random id per browser, kept in localStorage, so each browser counts once in A/B results.
// Falls back to one id per page view when storage is blocked.
export function getBrowserId () {
    try {
        const stored = localStorage.getItem( browserKey )
        if ( stored && /^[a-f0-9-]{16,40}$/.test( stored ) ) return stored
        const created = makeRandomId()
        localStorage.setItem( browserKey, created )
        return created
    } catch {
        if ( !pageBrowserId ) pageBrowserId = makeRandomId()
        return pageBrowserId
    }
}

export function sendEvent ( event, card, variant, control = '', experiment = '' ) {
    if ( !window.diaOptionalTrackingAllowed ) return

    const payload = JSON.stringify( {
        event,
        card,
        variant,
        control,
        experiment,
        browser: getBrowserId(),
        path: window.location.pathname
    } )

    try {
        if ( !navigator.sendBeacon || !navigator.sendBeacon( eventsUrl, new Blob( [ payload ], { type: 'text/plain' } ) ) ) {
            fetch( eventsUrl, { method: 'POST', body: payload, keepalive: true, mode: 'no-cors' } ).catch( () => {} )
        }
    } catch {}

    if ( typeof window.gtag === 'function' ) {
        window.gtag( 'event', `service_${ event }`, { service_card: card, service_variant: variant, service_control: control } )
    }
}

function cardInfo ( element ) {
    const card = element.closest( '[data-svc-card]' )
    if ( !card ) return null

    return {
        card,
        type: card.getAttribute( 'data-svc-card' ),
        variant: card.getAttribute( 'data-svc-variant' ) || '',
        experiment: card.getAttribute( 'data-svc-experiment' ) || ''
    }
}

const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver( entries => {
        for ( const entry of entries ) {
            if ( !entry.isIntersecting ) continue
            observer.unobserve( entry.target )
            const info = cardInfo( entry.target )
            if ( !info || impressionsSent.has( info.type ) ) continue
            impressionsSent.add( info.type )
            sendEvent( 'impression', info.type, info.variant, '', info.experiment )
        }
    }, { threshold: 0.5 } )
    : null

// Turnstile: load the script once, render a widget per form when it is first needed
const widgets = new WeakMap()
let turnstileLoading = null

function loadTurnstile () {
    if ( window.turnstile ) return Promise.resolve( window.turnstile )
    if ( turnstileLoading ) return turnstileLoading

    turnstileLoading = new Promise( ( resolve, reject ) => {
        const script = document.createElement( 'script' )
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        script.onload = () => window.turnstile ? resolve( window.turnstile ) : reject( new Error( 'Turnstile missing' ) )
        script.onerror = () => {
            turnstileLoading = null
            reject( new Error( 'Turnstile failed to load' ) )
        }
        document.head.appendChild( script )
    } )

    return turnstileLoading
}

function widgetFor ( form ) {
    const container = form.querySelector( '[data-svc-turnstile]' )
    if ( !siteKey || !container ) return null

    if ( !widgets.has( form ) ) {
        const state = { id: null, token: '', waiters: [], container }
        widgets.set( form, state )

        loadTurnstile().then( turnstile => {
            state.id = turnstile.render( container, {
                sitekey: siteKey,
                action: 'service-request',
                appearance: 'interaction-only',
                size: 'flexible',
                callback: token => {
                    state.token = token
                    state.waiters.splice( 0 ).forEach( resolve => resolve( token ) )
                },
                'expired-callback': () => { state.token = '' },
                'error-callback': () => {
                    state.token = ''
                    state.waiters.splice( 0 ).forEach( resolve => resolve( '' ) )
                }
            } )
        } ).catch( () => {
            state.waiters.splice( 0 ).forEach( resolve => resolve( '' ) )
        } )
    }

    return widgets.get( form )
}

function getTurnstileToken ( form ) {
    const state = widgetFor( form )
    if ( !state ) return Promise.resolve( null )
    if ( state.token ) return Promise.resolve( state.token )

    return new Promise( resolve => {
        state.waiters.push( resolve )
        setTimeout( () => resolve( state.token ), 60000 )
    } )
}

function resetTurnstile ( form ) {
    const state = widgets.get( form )
    if ( !state || state.id === null || !window.turnstile ) return
    state.token = ''
    try { window.turnstile.reset( state.id ) } catch {}
}

const formObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver( entries => {
        for ( const entry of entries ) {
            if ( !entry.isIntersecting ) continue
            formObserver.unobserve( entry.target )
            widgetFor( entry.target )
        }
    }, { rootMargin: '200px' } )
    : null

export function refreshServiceCards () {
    for ( const card of document.querySelectorAll( '[data-svc-card]' ) ) {
        if ( seen.has( card ) ) continue
        if ( card.hasAttribute( 'data-svc-page' ) ) {
            seen.add( card )
            // Service page forms are always visible, so get the widget ready as they near the viewport
            if ( formObserver ) card.querySelectorAll( '[data-svc-form]' ).forEach( form => formObserver.observe( form ) )
            continue
        }
        if ( card.hidden || !window.diaOptionalTrackingAllowed ) continue
        if ( card.hasAttribute( 'data-svc-variants' ) && typeof window.diaSvcApply === 'function' ) window.diaSvcApply( card )
        seen.add( card )
        if ( observer ) observer.observe( card )
    }
}

async function submitForm ( form ) {
    const status = form.querySelector( '[data-svc-status]' )
    const button = form.querySelector( 'button[type=submit]' )
    const info = cardInfo( form )
    const body = Object.fromEntries( new FormData( form ) )

    body.card = info?.type || ''
    body.variant = info?.variant || ''
    body.source = window.location.pathname
    delete body['cf-turnstile-response']

    if ( button ) button.disabled = true
    if ( status ) status.textContent = 'Sending…'

    try {
        // Managed mode sometimes asks for a click; say so instead of leaving "Sending…" up
        const hint = setTimeout( () => {
            if ( status ) status.textContent = 'Confirm you’re human above to send.'
        }, 1500 )
        const token = await getTurnstileToken( form )
        clearTimeout( hint )
        if ( status ) status.textContent = 'Sending…'
        if ( token === '' ) {
            if ( status ) status.textContent = 'Could not check that you’re human. Please try again.'
            resetTurnstile( form )
            return
        }
        if ( token ) body.turnstile = token

        const response = await fetch( form.action, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        const result = await response.json().catch( () => ( {} ) )

        if ( response.ok && result.ok ) {
            form.reset()
            if ( status ) status.textContent = form.getAttribute( 'data-svc-success' ) || 'Thanks. You’re on the list.'
            if ( info ) sendEvent( 'submit', info.type, info.variant, form.getAttribute( 'data-svc-submit' ) || body.kind || '', info.experiment )
            return
        }

        if ( status ) status.textContent = result.error || 'Could not send that. Please try again.'
    } catch {
        if ( status ) status.textContent = 'Could not send that. Please try again.'
    } finally {
        resetTurnstile( form )
        if ( button ) button.disabled = false
    }
}

export function initServiceCards ( { eventsEndpoint, turnstileSiteKey = '' } ) {
    eventsUrl = eventsEndpoint
    siteKey = turnstileSiteKey
    refreshServiceCards()
    if ( started ) return
    started = true

    // Vue hydration can replace slot content, so look again once it settles
    window.addEventListener( 'load', () => setTimeout( refreshServiceCards, 1000 ) )
    document.addEventListener( 'dia-svc-refresh', refreshServiceCards )
    document.addEventListener( 'dia-optional-tracking', refreshServiceCards )

    document.addEventListener( 'focusin', event => {
        const form = event.target instanceof Element && event.target.closest( '[data-svc-form]' )
        if ( form ) widgetFor( form )
    } )

    document.addEventListener( 'click', event => {
        const control = event.target instanceof Element && event.target.closest( '[data-svc-control]' )
        if ( !control ) return
        const info = cardInfo( control )
        if ( !info ) return

        const name = control.getAttribute( 'data-svc-control' )
        sendEvent( 'click', info.type, info.variant, name, info.experiment )

        if ( control instanceof HTMLAnchorElement && control.pathname.startsWith( '/services/' ) && !control.hash ) {
            const url = new URL( control.href )
            url.searchParams.set( 'card', info.type )
            url.searchParams.set( 'v', info.variant )
            if ( info.experiment ) url.searchParams.set( 'x', info.experiment )
            control.href = url.toString()
        }

        if ( control.hasAttribute( 'data-svc-open' ) ) {
            const form = info.card.querySelector( '[data-svc-form]' )
            if ( form ) {
                form.hidden = false
                widgetFor( form )
                form.querySelector( 'input[type=email]' )?.focus()
            }
        }
    } )

    document.addEventListener( 'submit', event => {
        const form = event.target instanceof HTMLFormElement && event.target.matches( '[data-svc-form]' ) ? event.target : null
        if ( !form ) return
        event.preventDefault()
        submitForm( form )
    } )
}

// Service pages: attribute the visit, clicks and requests to the card that sent the visitor
export function initServicePage ( options ) {
    const params = new URLSearchParams( window.location.search )
    const pick = name => idPattern.test( params.get( name ) || '' ) ? params.get( name ) : ''
    const variant = pick( 'v' ) || 'direct'
    const experiment = pick( 'x' )
    const root = document.querySelector( '[data-svc-page]' )

    if ( root ) {
        root.setAttribute( 'data-svc-variant', variant )
        root.setAttribute( 'data-svc-experiment', experiment )
    }

    initServiceCards( options )
    const sendImpression = () => sendEvent( 'impression', 'service-page', variant, '', experiment )
    if ( window.diaOptionalTrackingAllowed ) sendImpression()
    else document.addEventListener( 'dia-optional-tracking', sendImpression, { once: true } )
}

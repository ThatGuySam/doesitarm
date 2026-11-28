// Browser side of the service cards: impressions, clicks and form submits.
// Events carry only the card type, headline variant, control and page path.

let started = false
let eventsUrl = ''
const seen = new WeakSet()
// Vue hydration can swap a card for a copy, so count one impression per card type per page view
const impressionsSent = new Set()

export function sendEvent ( event, card, variant, control = '' ) {
    const payload = JSON.stringify( {
        event,
        card,
        variant,
        control,
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
        variant: card.getAttribute( 'data-svc-variant' ) || ''
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
            sendEvent( 'impression', info.type, info.variant )
        }
    }, { threshold: 0.5 } )
    : null

export function refreshServiceCards () {
    for ( const card of document.querySelectorAll( '[data-svc-card]' ) ) {
        if ( seen.has( card ) ) continue
        // Page-level forms carry data-svc-card too, but have no headline to test
        if ( card.hasAttribute( 'data-svc-variants' ) && typeof window.diaSvcApply === 'function' ) window.diaSvcApply( card )
        if ( card.hasAttribute( 'data-svc-page' ) ) continue
        if ( card.hidden ) continue
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

    if ( button ) button.disabled = true
    if ( status ) status.textContent = 'Sending…'

    try {
        const response = await fetch( form.action, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify( body )
        } )
        const result = await response.json().catch( () => ( {} ) )

        if ( response.ok && result.ok ) {
            form.reset()
            if ( status ) status.textContent = form.getAttribute( 'data-svc-success' ) || 'Thanks. You’re on the list.'
            if ( info ) sendEvent( 'submit', info.type, info.variant, form.getAttribute( 'data-svc-submit' ) || body.kind || '' )
            return
        }

        if ( status ) status.textContent = result.error || 'Could not send that. Please try again.'
    } catch {
        if ( status ) status.textContent = 'Could not send that. Please try again.'
    } finally {
        if ( button ) button.disabled = false
    }
}

export function initServiceCards ( { eventsEndpoint } ) {
    eventsUrl = eventsEndpoint
    refreshServiceCards()
    if ( started ) return
    started = true

    // Vue hydration can replace slot content, so look again once it settles
    window.addEventListener( 'load', () => setTimeout( refreshServiceCards, 1000 ) )
    document.addEventListener( 'dia-svc-refresh', refreshServiceCards )

    document.addEventListener( 'click', event => {
        const control = event.target instanceof Element && event.target.closest( '[data-svc-control]' )
        if ( !control ) return
        const info = cardInfo( control )
        if ( !info ) return

        const name = control.getAttribute( 'data-svc-control' )
        sendEvent( 'click', info.type, info.variant, name )

        if ( control instanceof HTMLAnchorElement && control.pathname.startsWith( '/services/' ) && !control.hash ) {
            const url = new URL( control.href )
            url.searchParams.set( 'card', info.type )
            url.searchParams.set( 'v', info.variant )
            control.href = url.toString()
        }

        if ( control.hasAttribute( 'data-svc-open' ) ) {
            const form = info.card.querySelector( '[data-svc-form]' )
            if ( form ) {
                form.hidden = false
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

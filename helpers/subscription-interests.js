export const appStatusConsent = 'Email me when this app’s reported Apple Silicon compatibility changes.'
export const rosettaNewsConsent = 'Email me when there is news about Rosetta removal.'

// Add a waitlist here to publish its form and accept its key in the Worker.
export const waitlists = {
    'plugin-audit': {
        title: 'Boutique compatibility audits for plug-ins',
        consent: 'Email me about the boutique compatibility audit service for plug-ins.'
    }
}

export const appListingPath = /^\/app\/([a-z0-9-]{1,120})$/

export function getSubscriptionConsent ( kind, key ) {
    if ( kind === 'app-status' && appListingPath.test( `/app/${ key }` ) ) {
        return appStatusConsent
    }

    if ( kind === 'rosetta-news' && key === '' ) {
        return rosettaNewsConsent
    }

    if ( kind === 'waitlist' && Object.hasOwn( waitlists, key ) ) {
        return waitlists[key].consent
    }
}

const additionalConsentCountries = new Set( [ 'GB', 'CH', 'NO', 'IS', 'LI' ] )

export const cookieRegionPath = '/api/cookie-region'
export const cookieChoiceKey = 'dia-cookie-consent-v1'

export function requiresCookieConsent ( cf ) {
    if ( cf?.isEUCountry === '1' ) return true

    const country = cf?.country
    // Cloudflare reports XX for unknown locations and T1 for Tor.
    return typeof country !== 'string' || !/^[A-Z]{2}$/.test( country ) ||
        country === 'XX' || additionalConsentCountries.has( country )
}

export function shouldLoadOptionalTracking ( consentRequired, choice ) {
    return consentRequired === false || choice === 'accept'
}

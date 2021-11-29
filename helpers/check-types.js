// Universal Imports Only

export function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}

export function isValidHttpUrl( string ) {
    if ( !isString( string ) ) return false

    let url

    try {
        url = new URL(string)
    } catch (_) {
        return false
    }

    return url.protocol === "http:" || url.protocol === "https:"
}

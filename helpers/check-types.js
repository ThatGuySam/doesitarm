// Universal Imports Only

export function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}

export function isValidHttpUrl( maybeUrl, allowUnsecure = false ) {
    if ( !isString( maybeUrl ) ) return false

    let url

    try {
        url = new URL(maybeUrl)
    } catch (_) {
        return false
    }

    if ( allowUnsecure ) {
        return url.protocol === "http:" || url.protocol === "https:"
    }

    return url.protocol === "https:"
}

export function isObject( maybeObject ) {
    return maybeObject === Object( maybeObject )
}

// Universal Imports Only

export function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}

export function isNonEmptyString ( maybeString ) {
    if ( !isString( maybeString ) ) return false

    return maybeString.length > 0
}

export function isPositiveNumberString ( maybeNumber ) {
    if ( !isString( maybeNumber ) ) return false

    return /\d+$/.test( maybeNumber )
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

export function isValidImageUrl ( maybeUrl ) {
    if ( !isValidHttpUrl( maybeUrl ) ) return false

    // Check if url has a file extension
    const url = new URL(maybeUrl)
    const fileExtension = url.pathname.split('.').pop()

    return isNonEmptyString( fileExtension )
}


export function isObject( maybeObject ) {
    return maybeObject === Object( maybeObject )
}

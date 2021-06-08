


export function isString( maybeString ) {
    return (typeof maybeString === 'string' || maybeString instanceof String)
}

export function isObject( maybeObject ) {
    return maybeObject === Object( maybeObject )
}

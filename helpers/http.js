function sleep ( delayMs ) {
    return new Promise( resolve => setTimeout( resolve, delayMs ) )
}

function normalizeUrl ( url ) {
    if ( url instanceof URL ) {
        return url.toString()
    }

    return String( url )
}

function toRequestConfig ( input, options = {} ) {
    if ( typeof input === 'string' || input instanceof URL ) {
        return {
            ...options,
            url: normalizeUrl( input )
        }
    }

    if ( input && typeof input === 'object' && 'url' in input ) {
        return {
            ...input,
            ...options,
            url: normalizeUrl( input.url )
        }
    }

    throw new Error( 'Expected a request URL or config object with a url field.' )
}

function createHeaders ( inputHeaders = {} ) {
    return new Headers( inputHeaders )
}

function hasResponseStatus ( error ) {
    return typeof error?.response?.status === 'number'
}

export function shouldRetryError ( error ) {
    return hasResponseStatus( error ) && error.response.status >= 500
}

export class HttpError extends Error {
    constructor ( message, {
        cause,
        data = null,
        method,
        status,
        statusText,
        url
    } ) {
        super( message )

        this.name = 'HttpError'
        this.cause = cause
        this.method = method
        this.status = status
        this.url = url
        this.response = {
            data,
            status,
            statusText,
            url
        }
    }
}

async function parseResponseBody ( response, responseType ) {
    if ( responseType === 'none' ) {
        return null
    }

    if ( responseType === 'text' ) {
        return await response.text()
    }

    const text = await response.text()

    if ( text.length === 0 ) {
        return null
    }

    return JSON.parse( text )
}

function buildRequestInit ( {
    body,
    cache,
    credentials,
    headers,
    method,
    mode,
    redirect,
    signal
} ) {
    return {
        body,
        cache,
        credentials,
        headers,
        method,
        mode,
        redirect,
        signal
    }
}

export async function request ( input, options = {} ) {
    const config = toRequestConfig( input, options )
    const {
        attempts = 1,
        cache,
        credentials,
        data,
        delayMs = 1000,
        headers: inputHeaders,
        method: inputMethod = 'GET',
        mode,
        redirect,
        responseType = 'json',
        signal,
        url
    } = config
    const method = inputMethod.toUpperCase()
    const headers = createHeaders( inputHeaders )

    let body
    if ( data !== undefined ) {
        body = JSON.stringify( data )

        if ( !headers.has( 'Accept' ) ) {
            headers.set( 'Accept', 'application/json' )
        }

        if ( !headers.has( 'Content-Type' ) ) {
            headers.set( 'Content-Type', 'application/json' )
        }
    }

    let lastError

    for ( let attempt = 1; attempt <= attempts; attempt += 1 ) {
        try {
            const response = await fetch( url, buildRequestInit({
                body,
                cache,
                credentials,
                headers,
                method,
                mode,
                redirect,
                signal
            }) )
            const responseData = await parseResponseBody( response, responseType )

            if ( !response.ok ) {
                throw new HttpError(
                    `${ method } ${ url } failed with status ${ response.status }`,
                    {
                        data: responseData,
                        method,
                        status: response.status,
                        statusText: response.statusText,
                        url
                    }
                )
            }

            return {
                data: responseData,
                response
            }
        } catch ( error ) {
            lastError = error

            if ( attempt >= attempts || !shouldRetryError( error ) ) {
                throw error
            }

            await sleep( delayMs )
        }
    }

    throw lastError
}

export async function getJson ( url, options = {} ) {
    const { data } = await request( url, {
        ...options,
        method: 'GET',
        responseType: 'json'
    } )

    return data
}

export async function getText ( url, options = {} ) {
    const { data } = await request( url, {
        ...options,
        method: 'GET',
        responseType: 'text'
    } )

    return data
}

export async function postJson ( url, data, options = {} ) {
    const { data: responseData } = await request( url, {
        ...options,
        data,
        method: 'POST',
        responseType: 'json'
    } )

    return responseData
}

export async function requestJson ( input, options = {} ) {
    const { data } = await request( input, {
        ...options,
        responseType: 'json'
    } )

    return data
}

export async function headOk ( url, options = {} ) {
    try {
        await request( url, {
            ...options,
            method: 'HEAD',
            responseType: 'none'
        } )

        return true
    } catch ( error ) {
        if ( error instanceof Error ) {
            return false
        }

        throw error
    }
}

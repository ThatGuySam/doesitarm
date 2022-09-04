import has from 'just-has'


export function isNuxt( VueThis ) {
    return has( VueThis, [ '$nuxt' ])
}

export function isBrowserContext () {
    if ( typeof navigator === 'undefined' ) return false

    return true
}

export function hasProcesGlobal () {
    if ( typeof process === 'undefined' ) return false

    return true
}


// https://stackoverflow.com/a/8684009/1397641
export function isDarwin () {
    if ( isBrowserContext() ) return false

    if ( !hasProcesGlobal() ) return false

    return process.platform === 'darwin'
}


export function isLinux () {
    if ( isBrowserContext() ) return false

    if ( !hasProcesGlobal() ) return false

    if ( process.platform === 'linux' ) return true

    if ( process.platform === 'openbsd' ) return true

    return false
}

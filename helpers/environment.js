import has from 'just-has'


export function isNuxt( VueThis ) {
    return has( VueThis, [ '$nuxt' ])
}

// https://stackoverflow.com/a/8684009/1397641
export function isDarwin () {
    if ( typeof navigator !== 'undefined' ) return false

    if ( typeof process === 'undefined' ) return false

    return process.platform === 'darwin'
}

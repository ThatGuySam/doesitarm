import has from 'just-has'


export function isNuxt( VueThis ) {
    return has( VueThis, [ '$nuxt' ])
}

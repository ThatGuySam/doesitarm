export function getSiteUrl () {

    // console.log( 'import.meta.site', import.meta.env )

    const hasImportMeta = typeof import.meta !== 'undefined'
    const hasImportMetaEnv = hasImportMeta && typeof import.meta.env !== 'undefined'

    // Try process.env.URL
    if ( typeof process.env.URL !== 'undefined' ) {
        console.log('Has env.URL')
        return process.env.URL
    }

    // Try Astro.site.origin
    if ( typeof Astro !== 'undefined' ) {
        console.log('Has Astro')
        return Astro.site.origin
    }

    // Try URL
    if ( hasImportMetaEnv && typeof import.meta.env.URL !== 'undefined' ) {
        console.log('Has URL')
        return import.meta.env.URL
    }

    // Try PUBLIC_URL
    if ( hasImportMetaEnv && typeof import.meta.env.PUBLIC_URL !== 'undefined' ) {
        console.log('Has PUBLIC_URL')
        return import.meta.env.PUBLIC_URL
    }

    throw new Error('Could not find site URL')
}

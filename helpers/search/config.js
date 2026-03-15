export const defaultSearchProvider = 'pagefind'

export const supportedSearchProviders = new Set([
    'pagefind',
    'stork'
])

export function getSearchProvider ( rawProvider = defaultSearchProvider ) {
    const provider = ( rawProvider || defaultSearchProvider ).toLowerCase()

    if ( supportedSearchProviders.has( provider ) ) {
        return provider
    }

    console.warn(`Unknown search provider "${ provider }", falling back to "${ defaultSearchProvider }"`)

    return defaultSearchProvider
}

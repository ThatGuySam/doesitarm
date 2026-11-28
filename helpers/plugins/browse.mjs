import { architectureFilters, directoryPath, formats, matchesFilters, products, vendors } from './catalog.mjs'

const pageSize = 24
const vendorSlugs = new Set(vendors.map(vendor => vendor.slug))

export function browsePath (page = 1, { vendor = '', format = '', arch = '' } = {}) {
    const filters = new URLSearchParams()
    if (format) filters.set('format', format)
    if (arch) filters.set('arch', arch)
    if (vendor) filters.set('vendor', vendor)
    if (!filters.size) return page === 1 ? directoryPath : `${directoryPath}page/${page}/`
    if (page !== 1) filters.set('page', String(page))
    return `${directoryPath}?${filters}`
}

export function browsePlugins (search, pathPage) {
    const filters = { format: search.get('format') ?? '', arch: search.get('arch') ?? '', vendor: search.get('vendor') ?? '' }
    const hasFilters = Object.values(filters).some(Boolean)
    const pageText = pathPage ?? search.get('page') ?? '1'
    if (!/^[1-9]\d*$/.test(pageText) || (filters.format && !Object.hasOwn(formats, filters.format))
        || (filters.arch && !Object.hasOwn(architectureFilters, filters.arch))
        || (filters.vendor && !vendorSlugs.has(filters.vendor))) return null

    const matched = hasFilters ? products.filter(product => matchesFilters(product, filters)) : products
    const page = Number(pageText)
    const pageCount = Math.max(1, Math.ceil(matched.length / pageSize))
    if (page > pageCount) return null
    return {
        pathname: browsePath(page, filters),
        filters,
        hasFilters,
        total: matched.length,
        page,
        pageCount,
        products: matched.slice((page - 1) * pageSize, page * pageSize)
    }
}

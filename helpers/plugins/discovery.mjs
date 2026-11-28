import { browsePath, browsePlugins } from './browse.mjs'
import { directoryPath, formats, productFormats, productPath, products, productSummary, vendorFor } from './catalog.mjs'

const publicProducts = products.filter(product => product.indexable)
export const pluginSitemapPath = '/sitemap-plugins.xml'

export function pluginSitemapEntries () {
    const { pageCount } = browsePlugins(new URLSearchParams())
    const browseRoutes = Array.from({ length: pageCount }, (_, index) => ({ route: browsePath(index + 1) }))
    return [
        ...browseRoutes,
        ...publicProducts.map(product => ({ route: productPath(product), lastModified: product.lastModified }))
    ]
}

export function pluginPagefindEntries () {
    return [
        {
            route: directoryPath,
            payload: { plugin: { name: 'Audio plug-ins', text: 'Browse scanned macOS Audio Units, VST, CLAP and AAX builds.' } }
        },
        ...publicProducts.map(product => {
            const { headline, verdict } = productSummary(product)
            const vendor = vendorFor(product)
            return {
                route: productPath(product),
                payload: {
                    plugin: {
                        name: product.name,
                        text: headline,
                        slug: product.slug,
                        aliases: product.aliases,
                        tags: [vendor.name, 'audio plug-in', ...productFormats(product).map(format => formats[format])],
                        status: ['native', 'universal', 'separate-downloads'].includes(verdict) ? 'native' : verdict,
                        category: { slug: 'music-and-audio-tools', label: 'Music and Audio Tools' }
                    }
                }
            }
        })
    ]
}

const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const pluginIndexEntry = /<sitemap\b[^>]*>\s*<loc>[^<]*\/sitemap-plugins\.xml<\/loc>(?:(?!<\/sitemap>)[\s\S])*<\/sitemap>/gu

export function renderPluginSitemap (siteUrl) {
    const entries = pluginSitemapEntries().map(({ route, lastModified }) => {
        const lastmod = lastModified ? `<lastmod>${lastModified}</lastmod>` : ''
        return `<url><loc>${new URL(route, siteUrl).href}</loc>${lastmod}</url>`
    })
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${sitemapNamespace}">\n${entries.join('\n')}\n</urlset>\n`
}

export function addPluginSitemapToIndex (indexXml, siteUrl) {
    if (!indexXml.includes('</sitemapindex>')) throw new Error('Expected a sitemap index')
    const loc = new URL(pluginSitemapPath, siteUrl).href
    return indexXml.replace(pluginIndexEntry, '')
        .replace('</sitemapindex>', `<sitemap><loc>${loc}</loc></sitemap></sitemapindex>`)
}

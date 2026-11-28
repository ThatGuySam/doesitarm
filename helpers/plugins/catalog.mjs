import identity from '../../data/plugins/identity.json' with { type: 'json' }
import catalog from '../../data/plugins.json' with { type: 'json' }

export const directoryPath = '/audio-plugins/'
export const formats = {
    auv2: 'AU (AUv2)',
    auv3: 'AUv3',
    vst2: 'VST2',
    vst3: 'VST3',
    clap: 'CLAP',
    aax: 'AAX',
    standalone: 'Standalone'
}
export const verdicts = {
    universal: 'Universal',
    native: 'Native Apple Silicon',
    'intel-only': 'Intel-only',
    legacy: 'Legacy 32-bit / PPC',
    'separate-downloads': 'Separate Apple Silicon and Intel downloads',
    mixed: 'Varies by build',
    unknown: 'Unverified'
}
export const architectureFilters = {
    native: 'Apple Silicon native',
    universal: verdicts.universal,
    'intel-only': verdicts['intel-only'],
    legacy: verdicts.legacy
}

export const products = catalog.products
export const vendors = Object.values(catalog.vendors).sort((a, b) => a.name.localeCompare(b.name, 'en'))
export const productBySlug = new Map(products.map(product => [product.slug, product]))
export const productById = new Map(products.map(product => [product.id, product]))
export const vendorFor = product => catalog.vendors[product.vendorId]
export const assetFor = build => catalog.assets[build.assetId]
export const productPath = product => `/plugin/${product.slug}/`
export function redirectForProductSlug (slug) {
    if (!Object.hasOwn(identity.redirects, slug)) return null
    return productPath(productBySlug.get(identity.redirects[slug]))
}
export const buildAnchor = build => `build-${build.id}`
export const vendorPath = vendor => `${directoryPath}?vendor=${encodeURIComponent(vendor.slug)}`

const formatOrder = Object.keys(formats)
const previews = new Set(['publisher beta', 'rolling preview'])

export function productFormats (product) {
    const observed = new Set(product.releases.flatMap(release => release.formats.map(group => group.format)))
    return formatOrder.filter(format => observed.has(format))
}

export function groupsInFormatOrder (release) {
    return [...release.formats].sort((a, b) => formatOrder.indexOf(a.format) - formatOrder.indexOf(b.format))
}

function pluginGroups (release) {
    return release.formats.filter(group => group.format !== 'standalone')
}

function pluginBundleVersion (release) {
    const versions = new Set(pluginGroups(release).map(group => group.bundleVersion))
    return versions.size === 1 ? versions.values().next().value : null
}

function numericVersion (label) {
    if (!label || !/^v?\d+(\.\d+)*$/i.test(label)) return []
    return label.replace(/^v/i, '').split('.').map(Number)
}

function compareRelease (a, b) {
    const previewOrder = Number(previews.has(a.channel)) - Number(previews.has(b.channel))
    if (previewOrder !== 0) return previewOrder
    const left = numericVersion(a.releaseLabel ?? pluginBundleVersion(a))
    const right = numericVersion(b.releaseLabel ?? pluginBundleVersion(b))
    if (!left.length || !right.length) return right.length - left.length || a.id.localeCompare(b.id, 'en')
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const difference = (right[index] ?? 0) - (left[index] ?? 0)
        if (difference !== 0) return difference
    }
    return a.id.localeCompare(b.id, 'en')
}

export function productReleases (product) {
    return [...product.releases].sort((a, b) => {
        return Number(!pluginGroups(a).length) - Number(!pluginGroups(b).length) || compareRelease(a, b)
    })
}

export function releaseName (release) {
    if (release.releaseLabel) return `Publisher release ${release.releaseLabel}`
    const version = pluginBundleVersion(release)
    return version ? `Bundle version ${version}` : 'Unversioned bundle'
}

const headlineCopy = {
    universal: '✅ Native Apple Silicon (Universal)',
    native: '✅ Native Apple Silicon',
    'intel-only': '🔶 Intel-only',
    legacy: '🔶 Legacy 32-bit / PPC',
    'separate-downloads': '✅ Separate Apple Silicon and Intel builds',
    mixed: '⚠️ Apple Silicon support varies',
    unknown: '❔ Apple Silicon support unverified'
}

export function productSummary (product) {
    const release = productReleases(product)[0]
    const groups = pluginGroups(release)
    const states = new Set(groups.map(group => group.verdict))
    const verdict = states.size === 1 ? states.values().next().value : 'mixed'
    const bundleVersion = pluginBundleVersion(release)
    const version = bundleVersion ? `v${bundleVersion.replace(/^v/i, '')}` : null
    const tag = release.releaseLabel
    const preview = release.channel === 'rolling preview' ? ' (preview)' : release.channel === 'publisher beta' ? ' (beta)' : ''
    const suffix = preview || version ? [preview, version && ` as of ${version}`].filter(Boolean).join('') : tag ? ` in ${tag}` : ''
    const base = verdict === 'mixed' && states.size > 1 && new Set(groups.map(group => group.format)).size > 1
        ? '⚠️ Apple Silicon support varies by format'
        : headlineCopy[verdict]
    const full = `${base}${suffix}`
    return {
        release,
        verdict,
        headline: [...full].length <= 80 ? full : `${base}${preview}`,
        softwareVersion: [...full].length <= 80 && version ? bundleVersion : null
    }
}

export function matchesFilters (product, { vendor, format, arch }) {
    if (vendor && vendorFor(product).slug !== vendor) return false
    return product.releases.some(release => release.formats.some(group => {
        if (format && group.format !== format) return false
        if (!arch) return true
        return group.builds.some(build => build.verdict === arch || (arch === 'native' && build.verdict === 'universal'))
    }))
}

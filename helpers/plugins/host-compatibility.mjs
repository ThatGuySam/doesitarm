import loaderPaths from '../../data/plugins/host-loader-paths.json' with { type: 'json' }
import capabilities from '../../data/plugins/host-capabilities.json' with { type: 'json' }
import outcomes from '../../data/plugins/host-outcomes.json' with { type: 'json' }
import profiles from '../../data/plugins/host-profiles.json' with { type: 'json' }
import { assetFor, productById } from './catalog.mjs'

const exactHostVersion = /^v?\d+(?:\.\d+)+(?:[-+][a-z0-9.-]+)?$/i
const isText = value => typeof value === 'string' && value.trim().length > 0
function isDate (value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(value)
    return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value)
}
function isSource (value) {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' && !url.username && !url.password
    } catch {
        return false
    }
}

function numericVersion (label) {
    if (typeof label !== 'string' || !/^\d+(\.\d+){0,2}$/.test(label)) return null
    const parts = label.split('.').map(Number)
    return parts[0] * 1000000 + (parts[1] ?? 0) * 1000 + (parts[2] ?? 0)
}

function inMacOSRange (version, range) {
    const actual = numericVersion(version)
    const minimum = numericVersion(range?.min)
    const maximum = numericVersion(range?.max)
    return actual !== null && minimum !== null && maximum !== null && minimum <= actual && actual <= maximum
}

function supportsLoader (profile, test) {
    const { loader, hostArch, hostMode, format } = profile
    if (!loader || !isSource(loader.sourceUrl) || !inMacOSRange(test.macOS, loader.macOS)) return false
    const path = hostMode === 'rosetta' ? 'rosetta'
        : ['in-process', 'native-service'].includes(loader.kind) ? 'native' : loader.kind
    if (!loaderPaths[profile.endpoint]?.[format]?.includes(path)) return false
    if (hostMode === 'rosetta') {
        return hostArch === 'x86_64' && loader.kind === 'in-process' && loader.arch === 'x86_64'
            && numericVersion(test.macOS) < numericVersion('28') && isSource(profile.rosettaSourceUrl)
    }
    if (hostMode !== 'native' || hostArch !== 'arm64') return false
    if (['in-process', 'native-service'].includes(loader.kind)) return loader.arch === hostArch
    if (!isText(loader.name) || loader.arch !== 'x86_64') return false
    if (numericVersion(test.macOS) >= numericVersion('28')) return false
    if (loader.kind === 'apple-au-translation') return format === 'auv2'
    return loader.kind === 'vendor-bridge'
}

function sameRun (a, b) {
    return ['productId', 'releaseId', 'buildId', 'format', 'componentId', 'profileId', 'role', 'insertContext',
        'hardware', 'macOS', 'macOSBuild'].every(field => a[field] === b[field])
}

// A capability row is a starting point for a reviewed, exact profile. Its
// version and loader prose never becomes an allow-list by itself.
export function qualifiesHostMatch ({ product, release, group, build, profile, rule, outcome, conflicts = [] }) {
    if (!product?.indexable || !rule || !profile || !outcome || !build || !group || !release) return false
    if (outcome.wrapper || !['documented', 'conditional'].includes(rule.status)) return false
    if (profile.capabilityId !== rule.id || profile.endpoint !== rule.endpoint || !isSource(rule.sourceUrl)) return false
    if (profile.review !== 'reviewed' || !isText(profile.edition) || !exactHostVersion.test(profile.hostVersion ?? '') || !isSource(profile.sourceUrl)) return false
    if (!['effect', 'instrument', 'note_effect', 'AudioSuite', 'sequence_render', 'playback_instrument',
        'mixer_effect', 'analysis_effect', 'playback_dsp', 'midi'].includes(outcome.role)) return false
    if (!isText(outcome.componentId) || !isText(outcome.insertContext) || outcome.insertContext !== profile.insertContext
        || !Array.isArray(profile.roles) || !profile.roles.includes(outcome.role) || !rule.roles.includes(outcome.role)) return false
    if (outcome.profileId !== profile.id || outcome.productId !== product.id || outcome.releaseId !== release.id
        || outcome.buildId !== build.id || outcome.format !== group.format
        || outcome.format !== profile.format || profile.format !== rule.format || build.format !== group.format) return false
    if (!product.releases.includes(release) || !release.formats.includes(group) || !group.builds.includes(build)) return false
    if (build.platform !== 'macOS' || build.scanStatus !== 'complete' || build.role !== 'plugin-candidate'
        || group.format === 'standalone') return false
    if (!isText(outcome.hardware) || !Array.isArray(profile.hardware) || !profile.hardware.includes(outcome.hardware) || !isText(outcome.macOSBuild)
        || !inMacOSRange(outcome.macOS, profile.macOS) || !supportsLoader(profile, outcome)) return false
    if (!Array.isArray(profile.requirements) || !Array.isArray(outcome.fulfilledRequirements)
        || !profile.requirements.every(item => outcome.fulfilledRequirements.includes(item))) return false
    const slice = build.slices.find(slice => slice.arch === profile.loader.arch)
    if (!slice) return false
    const actualOS = numericVersion(outcome.macOS)
    const declaredFloors = [slice.minMacOS, build.bundleMinMacOS].filter(Boolean).map(numericVersion)
    if (declaredFloors.some(floor => floor === null || actualOS < floor)) return false
    if (outcome.componentIdentity !== 'format-id' && !(outcome.componentIdentity === 'single-component-artifact'
        && outcome.proof?.selectedBuildId === build.id)) return false

    const proof = outcome.proof
    if (!proof || proof.result !== 'pass' || proof.review !== 'reviewed' || !isSource(proof.sourceUrl)
        || !isDate(proof.checkedOn) || proof.scope !== 'exact-configuration' || outcome.blockingConflict
        || conflicts.some(conflict => conflict.proof?.review === 'reviewed' && conflict.proof?.result === 'fail'
            && conflict.proof?.action !== 'session-recall' && !conflict.resolved && sameRun(outcome, conflict))) return false
    if (proof.method === 'reproduced-runtime') {
        return proof.discovery === true && proof.instantiation === true && proof.processing === true
    }
    return proof.method === 'explicit-vendor-qualification' && proof.inHostUse === true
        && (declaredFloors.length > 0 || proof.exactOSQualified === true)
}

export function collectVerifiedHostMatches (productIndex, hostProfiles, hostRules, results) {
    const ruleIndex = new Map(hostRules.map(rule => [rule.id, rule]))
    const profileIndex = new Map(hostProfiles.map(profile => [profile.id, profile]))
    const conflicts = results.filter(result => result.proof?.result === 'fail')
    return results.flatMap(outcome => {
        const product = productIndex.get(outcome.productId)
        const release = product?.releases.find(release => release.id === outcome.releaseId)
        const group = release?.formats.find(group => group.builds.some(build => build.id === outcome.buildId))
        const build = group?.builds.find(build => build.id === outcome.buildId)
        const profile = profileIndex.get(outcome.profileId)
        const rule = ruleIndex.get(profile?.capabilityId)
        if (!qualifiesHostMatch({ product, release, group, build, profile, rule, outcome, conflicts })) return []
        const recallFailure = conflicts.find(conflict => sameRun(outcome, conflict) && !conflict.resolved
            && conflict.proof?.action === 'session-recall' && conflict.proof.review === 'reviewed'
            && isSource(conflict.proof.sourceUrl) && isDate(conflict.proof.checkedOn))
        return [{ product, release, build, profile, rule, outcome, recallFailure }]
    })
}

const matches = collectVerifiedHostMatches(productById, profiles, capabilities, outcomes)

export function verifiedPluginsForHost (endpoint) {
    const canonicalEndpoint = endpoint.replace(/\/$/, '')
    const byProduct = new Map()
    for (const match of matches) {
        if (match.profile.endpoint !== canonicalEndpoint) continue
        const configurations = byProduct.get(match.product.id) ?? []
        configurations.push(match)
        byProduct.set(match.product.id, configurations)
    }
    return [...byProduct.values()]
}

export const verifiedHostsForProduct = product => matches.filter(match => match.product.id === product.id)

export function hostCapabilitiesForFormat (format) {
    return capabilities.filter(rule => rule.format === format && rule.status !== 'hold')
        .sort((a, b) => a.hostName.localeCompare(b.hostName, 'en'))
}

export function describeHostMatch ({ build, profile, outcome, rule }) {
    const version = build.bundleVersion ? `v${build.bundleVersion.replace(/^v/i, '')}` : assetFor(build).filename
    const mode = profile.hostMode === 'rosetta' ? 'host opened using Rosetta'
        : profile.loader.arch === 'x86_64' ? `native host with ${profile.loader.name}` : 'native Apple Silicon'
    return `${version} in ${rule.hostName} ${profile.edition} ${profile.hostVersion} on macOS ${outcome.macOS} (${outcome.macOSBuild}), ${mode}`
}

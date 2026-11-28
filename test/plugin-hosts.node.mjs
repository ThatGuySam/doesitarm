import assert from 'node:assert/strict'
import { test } from 'node:test'
import capabilities from '../data/plugins/host-capabilities.json' with { type: 'json' }
import {
    collectVerifiedHostMatches, qualifiesHostMatch, hostCapabilitiesForFormat, verifiedPluginsForHost
} from '../helpers/plugins/host-compatibility.mjs'
import { matchesFilters, productBySlug, productSummary, products } from '../helpers/plugins/catalog.mjs'

const sourceUrl = 'https://example.com/exact-test-record'

function fixture ({ host = 'ableton', format = 'vst3', role = 'effect', arch = 'arm64', loader = 'in-process',
    hostMode = 'native', macOS = '26.1', verifiedFormat = format, verdict = 'native' } = {}) {
    const rule = capabilities.find(row => row.endpoint === `/app/${host}`
        && row.format === format && ['documented', 'conditional'].includes(row.status))
    const build = {
        id: 'observed-build', format: verifiedFormat, platform: 'macOS', scanStatus: 'complete',
        role: 'plugin-candidate', slices: [{ arch, minMacOS: '11.0' }], bundleVersion: '1.2.0', verdict
    }
    const group = { format: verifiedFormat, builds: [build] }
    const release = { id: 'observed-release', formats: [group] }
    const product = { id: 'observed-product', releases: [release], indexable: true }
    const profile = {
        id: 'host-profile', capabilityId: rule?.id, endpoint: `/app/${host}`, review: 'reviewed',
        edition: 'Standard', hostVersion: '12.4.0', sourceUrl, format, roles: [role],
        insertContext: 'standard track insert', hostMode,
        hostArch: hostMode === 'rosetta' ? 'x86_64' : 'arm64', rosettaSourceUrl: sourceUrl,
        hardware: ['Apple M2'], macOS: { min: '12', max: '28' }, requirements: ['enabled'],
        loader: { kind: loader, arch, macOS: { min: '12', max: '28' }, name: 'Apple AU service', sourceUrl }
    }
    const outcome = {
        profileId: profile.id, productId: product.id, releaseId: release.id, buildId: build.id,
        format: verifiedFormat, componentId: 'selected-component', componentIdentity: 'format-id',
        role, insertContext: profile.insertContext, hardware: 'Apple M2', macOS, macOSBuild: '25B83',
        fulfilledRequirements: ['enabled'],
        proof: {
            method: 'reproduced-runtime', sourceUrl, checkedOn: '2026-11-27', scope: 'exact-configuration',
            result: 'pass', review: 'reviewed', discovery: true, instantiation: true, processing: true
        }
    }
    return { product, release, group, build, profile, rule, outcome }
}

test('qualifies a reproduced runtime pass or exact vendor qualification', () => {
    const input = fixture()
    assert.equal(qualifiesHostMatch(input), true)
    input.outcome.proof = { ...input.outcome.proof, method: 'explicit-vendor-qualification', inHostUse: true }
    assert.equal(qualifiesHostMatch(input), true)
    input.outcome.proof.scope = 'product-family'
    assert.equal(qualifiesHostMatch(input), false)
})

test('capabilities never supply a runtime pass, and a partial run is insufficient', () => {
    const input = fixture()
    for (const proof of [undefined, { ...input.outcome.proof, method: 'static-publisher-binary-scan' },
        { ...input.outcome.proof, processing: false }, { ...input.outcome.proof, sourceUrl: '' },
        { ...input.outcome.proof, checkedOn: '2026-02-30' }]) {
        assert.equal(qualifiesHostMatch({ ...input, outcome: { ...input.outcome, proof } }), false)
    }
    assert.ok(hostCapabilitiesForFormat('auv2').some(row => row.endpoint === '/app/logic-pro'))
    for (const host of ['logic-pro', 'ableton', 'reaper']) assert.deepEqual(verifiedPluginsForHost(`/app/${host}/`), [])
})

test('host edition, format, role and insert requirements remain bound to the demonstrated configuration', () => {
    assert.equal(qualifiesHostMatch(fixture({ host: 'final-cut-pro', format: 'auv2' })), true)
    assert.equal(qualifiesHostMatch(fixture({ host: 'final-cut-pro', format: 'auv2', role: 'instrument' })), false)
    for (const host of ['logic-pro', 'garageband', 'final-cut-pro', 'avid-pro-tools']) {
        assert.equal(qualifiesHostMatch(fixture({ host, format: 'auv2', verifiedFormat: 'vst3' })), false)
    }
    const input = fixture()
    assert.equal(qualifiesHostMatch({ ...input, outcome: { ...input.outcome, fulfilledRequirements: [] } }), false)
    assert.equal(qualifiesHostMatch({ ...input, profile: { ...input.profile, edition: '' } }), false)
    assert.equal(qualifiesHostMatch({ ...input, rule: { ...input.rule, status: 'hold' } }), false)
})

test('accepts documented Intel translation only with the exact eligible format, host and OS', () => {
    assert.equal(qualifiesHostMatch(fixture({ arch: 'x86_64' })), false)
    assert.equal(qualifiesHostMatch(fixture({ arch: 'x86_64', loader: 'apple-au-translation' })), false)
    assert.equal(qualifiesHostMatch(fixture({ format: 'auv2', arch: 'x86_64', loader: 'apple-au-translation' })), true)
    assert.equal(qualifiesHostMatch(fixture({ format: 'auv2', arch: 'x86_64', loader: 'apple-au-translation', macOS: '28' })), false)
    assert.equal(qualifiesHostMatch(fixture({ host: 'avid-pro-tools', format: 'aax' })), true)
    assert.equal(qualifiesHostMatch(fixture({ host: 'avid-pro-tools', format: 'aax', arch: 'x86_64' })), false)
    assert.equal(qualifiesHostMatch(fixture({ host: 'avid-pro-tools', format: 'aax', arch: 'x86_64', hostMode: 'rosetta' })), true)
    assert.equal(qualifiesHostMatch(fixture({ host: 'avid-pro-tools', format: 'aax', arch: 'x86_64', hostMode: 'rosetta', macOS: '28' })), false)
    assert.equal(qualifiesHostMatch(fixture({ host: 'avid-pro-tools', format: 'aax', arch: 'i386', hostMode: 'rosetta' })), false)
    assert.equal(qualifiesHostMatch(fixture({ host: 'cubase', format: 'vst2' })), false)
    assert.equal(qualifiesHostMatch(fixture({ host: 'cubase', format: 'vst2', arch: 'x86_64', hostMode: 'rosetta' })), true)
    assert.equal(qualifiesHostMatch(fixture({ host: 'fl-studio', arch: 'x86_64', loader: 'vendor-bridge' })), true)
    assert.equal(qualifiesHostMatch(fixture({ host: 'fl-studio', format: 'clap', arch: 'x86_64', loader: 'vendor-bridge' })), false)
})

test('rejects mismatched builds, missing component identity, wrappers, and unknown OS bounds', () => {
    const input = fixture()
    for (const change of [{ buildId: 'different' }, { componentId: '' }, { wrapper: true }, { macOS: '10.15' }]) {
        assert.equal(qualifiesHostMatch({ ...input, outcome: { ...input.outcome, ...change } }), false)
    }
    input.outcome.componentIdentity = 'single-component-artifact'
    assert.equal(qualifiesHostMatch(input), false)
    input.outcome.proof.selectedBuildId = input.build.id
    assert.equal(qualifiesHostMatch(input), true)
    input.profile.macOS = { min: '12' }
    assert.equal(qualifiesHostMatch(input), false)
})

test('recall failure remains visible and an exact blocking conflict suppresses the match', () => {
    const { product, profile, rule, outcome } = fixture()
    const failure = { ...outcome, proof: { ...outcome.proof, result: 'fail', action: 'session-recall' } }
    const collect = results => collectVerifiedHostMatches(new Map([[product.id, product]]), [profile], [rule], results)
    assert.equal(collect([outcome, failure])[0].recallFailure, failure)
    failure.proof.action = 'instantiation'
    assert.deepEqual(collect([outcome, failure]), [])
    assert.equal(collect([outcome, { ...failure, macOSBuild: 'another-build' }]).length, 1)
})

test('catalog filters apply format and architecture to the same scanned bundle', () => {
    const proteus = productBySlug.get('proteus')
    assert.ok(matchesFilters(proteus, { format: 'aax', arch: 'intel-only' }))
    assert.ok(!matchesFilters(proteus, { format: 'aax', arch: 'native' }))
    assert.ok(matchesFilters(proteus, { format: 'vst3', arch: 'native' }))
    assert.ok(!matchesFilters(productBySlug.get('neuralnote'), { arch: 'universal' }))
    assert.ok(matchesFilters(productBySlug.get('tal-dub'), { arch: 'legacy' }))
    assert.ok(!matchesFilters(productBySlug.get('tal-dub'), { arch: 'intel-only' }))
})

test('all corpus headlines fit the copy limit and preserve the release qualifications', () => {
    for (const product of products) assert.ok([...productSummary(product).headline].length <= 80)
    assert.equal(productSummary(productBySlug.get('dexed')).headline, '✅ Native Apple Silicon (Universal) as of v1.1.1')
    assert.match(productSummary(productBySlug.get('proteus')).headline, /varies by format/)
    assert.match(productSummary(productBySlug.get('surge-xt')).headline, /preview/)
    assert.equal(productSummary(productBySlug.get('mverb')).softwareVersion, null)
})

test('browse routes bound pagination and normalize shareable filters', async () => {
    const { browsePlugins } = await import('../helpers/plugins/browse.mjs')
    const browse = (search = '', page) => browsePlugins(new URLSearchParams(search), page)
    assert.equal(browse().pageCount, 8)
    assert.equal(browse('', '2').pathname, '/audio-plugins/page/2/')
    assert.equal(browse('vendor=guitarml&arch=intel-only&format=aax').pathname,
        '/audio-plugins/?format=aax&arch=intel-only&vendor=guitarml')
    assert.ok(browse('vendor=guitarml&arch=intel-only&format=aax').products.some(product => product.slug === 'proteus'))
    assert.equal(browse('', '9'), null)
    assert.equal(browse('format=__proto__'), null)
})

test('search records and sitemap derive from the same canonical products', async () => {
    const { pluginPagefindEntries, pluginSitemapEntries, renderPluginSitemap, addPluginSitemapToIndex }
        = await import('../helpers/plugins/discovery.mjs')
    const origin = 'https://doesitarm.com'
    const entries = pluginSitemapEntries()
    const urls = new Set(entries.map(entry => entry.route))
    assert.equal(urls.size, entries.length)
    assert.equal(pluginPagefindEntries().filter(entry => entry.route.startsWith('/plugin/')).length,
        entries.filter(entry => entry.route.startsWith('/plugin/')).length)
    for (const entry of pluginPagefindEntries()) assert.ok(urls.has(entry.route))
    assert.ok(renderPluginSitemap(origin).includes('<loc>https://doesitarm.com/plugin/dexed/</loc>'))
    const index = addPluginSitemapToIndex('<sitemapindex><sitemap><loc>https://doesitarm.com/sitemap-0.xml</loc></sitemap></sitemapindex>', origin)
    assert.equal(addPluginSitemapToIndex(index, origin), index)
})

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { parse } from 'node-html-parser'
import { describe, expect, it } from 'vitest'

import { productBySlug, productSummary } from '../../helpers/plugins/catalog.mjs'
import HostPlugins from '../../src/components/listing-parts/host-plugins.astro'
import BuildTable from '../../src/components/plugins/build-table.astro'
import ProductHosts from '../../src/components/plugins/product-hosts.astro'

describe('plug-in evidence markup', () => {
    it('renders an Intel-only AAX build separately from Universal Audio Units', async () => {
        const container = await AstroContainer.create()
        const product = productBySlug.get('proteus')
        const html = await container.renderToString(BuildTable, { props: { release: productSummary(product).release } })
        const rows = parse(html).querySelectorAll('tbody tr')
        const aax = rows.find(row => row.querySelector('th').text.includes('AAX'))
        const au = rows.find(row => row.querySelector('th').text.includes('AU (AUv2)'))
        expect(aax.querySelector('td').text).toContain('Intel-only')
        expect(au.querySelector('td').text).toContain('Universal')
        expect(aax.querySelector('time').getAttribute('datetime')).toBe('2026-11-27')
        expect(aax.querySelector('code').text).toMatch(/^[a-f0-9]{64}$/)
        expect(aax.querySelector('a').getAttribute('href')).toBe('https://github.com/GuitarML/Proteus/releases/tag/v1.2')
    })

    it('shows format support on plug-in listings without claiming that the plug-in passed', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString(ProductHosts, { props: { product: productBySlug.get('dexed') } })
        expect(html).toContain('AU (AUv2) format loads in')
        expect(html).toContain('href="/app/logic-pro"')
        expect(html).toContain('Loading this plug-in in these hosts is unverified.')
        expect(html).not.toContain('Verified hosts')
    })

    it('omits the host section when there are no exact qualifying results', async () => {
        const container = await AstroContainer.create()
        const html = await container.renderToString(HostPlugins, { props: { endpoint: '/app/ableton' } })
        expect(html.trim()).toBe('')
    })
})

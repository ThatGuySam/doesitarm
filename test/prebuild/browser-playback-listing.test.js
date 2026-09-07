import { describe, it, expect } from 'vitest'
import { buildReadmeAppList } from '../../helpers/build-app-list.js'

describe('Browser playback listing evidence', () => {
    it('keeps a Netflix wrapper scan separate from Safari 4K support', () => {
        const scan = {
            aliases: ['Netflix'],
            bundleIds: ['com.fluidapp.Netflix'],
            tags: [],
            relatedLinks: [{ label: 'Wrapper scan', href: 'https://example.com/scan' }]
        }
        const scans = new Map([['netflix', scan]])
        const [listing] = buildReadmeAppList({
            readmeContent: '#### Entertainment and Media Apps\n\n* [Netflix 4K on Safari](https://www.netflix.com/) - ✅ Yes, UHD streaming on qualifying Apple Silicon Macs - [Official Requirements](https://help.netflix.com/en/node/55764)\n\n<!-- end-of-list -->',
            scanListMap: scans,
            commits: []
        })
        expect(listing.endpoint).toBe('/app/netflix-4k-on-safari')
        expect(listing.bundleIds).toEqual([])
        expect(listing.aliases).toEqual([])
        expect(listing.relatedLinks.some(link => link.label === 'Wrapper scan')).toBe(false)
        expect(scans.get('netflix')).toBe(scan)
    })
})

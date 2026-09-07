import { it, expect } from 'vitest'
import { buildReadmeAppList } from '../../helpers/build-app-list.js'

it('merges Android Studio scans without consuming BrickLink Studio', () => {
    const makeScan = (aliases, id) => ({ aliases, bundleIds: [id], tags: [], relatedLinks: [] })
    const bricklink = makeScan(['Studio', 'BrickLink Studio'], 'com.bricklink.studio')
    const scans = new Map([
        ['bricklink', bricklink],
        ['android', makeScan(['Android Studio'], 'com.google.android.studio')]
    ])
    const [listing] = buildReadmeAppList({
        readmeContent: '#### Developer Tools\n\n* [Android Studio](https://developer.android.com/studio) - ✅ Native Apple Silicon support\n\n<!-- end-of-list -->',
        scanListMap: scans,
        commits: []
    })
    expect(listing.bundleIds).toEqual(['com.google.android.studio'])
    expect(listing.aliases).not.toContain('BrickLink Studio')
    expect(scans.get('bricklink')).toBe(bricklink)
    expect(scans.has('android')).toBe(false)
})

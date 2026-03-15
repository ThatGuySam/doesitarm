import { describe, expect, it } from 'vitest'

import {
    getStorkExecutableTarget,
    getStorkExecutableDownloadUrl
} from '~/helpers/stork/executable.js'

describe( 'stork executable selection', () => {
    it( 'uses the Ubuntu 22.04 binary for Linux builds', () => {
        expect( getStorkExecutableTarget({
            platform: 'linux',
            arch: 'x64'
        }) ).toBe( 'stork-ubuntu-22-04' )
    })

    it( 'uses the Apple Silicon macOS binary on arm64 Macs', () => {
        expect( getStorkExecutableTarget({
            platform: 'darwin',
            arch: 'arm64'
        }) ).toBe( 'stork-macos-13-arm' )
    })

    it( 'builds the download URL from the selected target', () => {
        expect( getStorkExecutableDownloadUrl({
            platform: 'linux',
            arch: 'x64'
        }) ).toContain( '/stork-ubuntu-22-04' )
    })
})

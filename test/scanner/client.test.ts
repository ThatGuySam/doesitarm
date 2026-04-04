import {
    describe,
    expect,
    it
} from 'vitest'
import '@vitest/web-worker'

import { runScanWorker } from '~/helpers/scanner/client'

import { createNativeAppArchive } from '../playwright/support/app-archive-fixture'

describe( 'scanner worker client', () => {
    it( 'extracts app metadata from a zipped native app fixture', async () => {
        const progressMessages: string[] = []
        const archiveFile = await createNativeAppArchive()

        const { scan } = await runScanWorker( archiveFile, details => {
            if ( typeof details.message === 'string' ) {
                progressMessages.push( details.message )
            }
        } )

        expect( progressMessages ).toContain( 'ℹ️ Found Info.plist' )
        expect( scan.status ).toBe( 'finished' )
        expect( scan.displayName ).toBe( 'Playwright Native App' )
        expect( scan.appVersion ).toBe( '1.0.0' )
        expect( scan.binarySupportsNative ).toBe( true )
        expect( scan.displayBinarySize.length ).toBeGreaterThan( 0 )
        expect( scan.details ).toEqual( expect.arrayContaining( [
            expect.objectContaining({
                label: 'Bundle Identifier',
                value: 'com.doesitarm.playwright-native-app'
            }),
            expect.objectContaining({
                label: 'Version',
                value: '1.0.0'
            })
        ] ) )
        expect( scan.info.filename ).toBe( 'Playwright Native App.app.zip' )
        expect( scan.info.result ).toBe( '✅' )
        expect( scan.info.infoPlist.CFBundleIdentifier ).toBe( 'com.doesitarm.playwright-native-app' )
        expect( scan.info.machoMeta.architectures ).toEqual( expect.arrayContaining( [
            expect.objectContaining({
                processorType: 'ARM64'
            })
        ] ) )
    } )
} )

import { describe, expect, it } from 'vitest'

import {
    fillServiceCopy,
    getServiceCardType,
    isAudioSearchQuery,
    serviceCards
} from '~/helpers/service-offers.js'

const audio = { slug: 'music-and-audio-tools' }

describe( 'service card placement', () => {
    it( 'shows the audit card on non-native audio apps', () => {
        expect( getServiceCardType( { endpoint: '/app/native-access', status: 'rosetta', category: audio } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/old-synth', status: 'no', category: audio } ) ).toBe( 'audio' )
    } )

    it( 'shows the native card on native audio apps', () => {
        expect( getServiceCardType( { endpoint: '/app/logic-pro', status: 'native', category: audio } ) ).toBe( 'audio-native' )
    } )

    it( 'shows the revival card only on the allowlist', () => {
        expect( getServiceCardType( { endpoint: '/app/true-fi', status: 'no', category: { slug: 'entertainment-and-media-apps' } } ) ).toBe( 'revival' )
        expect( getServiceCardType( { endpoint: '/app/some-other-app', status: 'no', category: { slug: 'entertainment-and-media-apps' } } ) ).toBeNull()
    } )

    it( 'shows nothing on games, formulas or other categories', () => {
        expect( getServiceCardType( { endpoint: '/game/world-of-warcraft', status: 'native', category: { slug: 'games' } } ) ).toBeNull()
        expect( getServiceCardType( { endpoint: '/formula/ffmpeg', status: 'rosetta', category: { slug: 'homebrew' } } ) ).toBeNull()
        expect( getServiceCardType( { endpoint: '/app/notion', status: 'rosetta', category: { slug: 'productivity-tools' } } ) ).toBeNull()
        expect( getServiceCardType( null ) ).toBeNull()
    } )
} )

describe( 'home search audio match', () => {
    it( 'matches audio terms as whole words', () => {
        for ( const query of [ 'Logic Pro', 'ableton', 'pro tools', 'my VST3 plugins', 'AU', 'iZotope Ozone', 'plug-in', 'mixing' ] ) {
            expect( isAudioSearchQuery( query ), query ).toBe( true )
        }
    } )

    it( 'ignores unrelated queries and partial words', () => {
        for ( const query of [ '', 'photoshop', 'chrome', 'autocad', 'audacious-ish', 'logical', 'steam' ] ) {
            expect( isAudioSearchQuery( query ), query ).toBe( false )
        }
    } )
} )

describe( 'service copy', () => {
    it( 'has unique variant ids and one-line copy', () => {
        const ids = Object.values( serviceCards ).flatMap( card => card.variants.map( variant => variant.id ) )
        expect( new Set( ids ).size ).toBe( ids.length )

        for ( const card of Object.values( serviceCards ) ) {
            expect( card.subhead.length ).toBeLessThanOrEqual( 80 )
            for ( const variant of card.variants ) expect( variant.headline.length ).toBeLessThanOrEqual( 60 )
        }
    } )

    it( 'fills the app name', () => {
        expect( fillServiceCopy( '{app} runs natively. Do your sessions?', { app: 'Logic Pro' } ) ).toBe( 'Logic Pro runs natively. Do your sessions?' )
    } )
} )

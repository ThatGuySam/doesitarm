import { describe, expect, it } from 'vitest'

import {
    fillServiceCopy,
    getServiceCardType,
    isAudioSearchQuery,
    serviceCards,
    servicePages,
    servicesIndex
} from '~/helpers/service-offers.js'
import { serviceOffers } from '~/workers/subscriptions/src/services.js'

const audio = { slug: 'music-and-audio-tools' }

describe( 'service card placement', () => {
    it( 'shows the audit card on non-native audio apps', () => {
        expect( getServiceCardType( { endpoint: '/app/native-access', status: 'rosetta', category: audio } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/old-synth', status: 'no', category: audio } ) ).toBe( 'audio' )
    } )

    it( 'shows the native card on native audio apps', () => {
        expect( getServiceCardType( { endpoint: '/app/logic-pro', status: 'native', category: audio } ) ).toBe( 'audio-native' )
    } )

    it( 'finds audio apps outside the category by slug or name', () => {
        expect( getServiceCardType( { endpoint: '/app/melodyne', name: 'Melodyne', status: 'native' } ) ).toBe( 'audio-native' )
        expect( getServiceCardType( { endpoint: '/app/native-access', name: 'Native Access', status: 'rosetta', category: { slug: 'homebrew' } } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/kontakt-8', name: 'Kontakt 8', status: 'rosetta' } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/izotope-portal', name: 'Portal', aliases: [ 'iZotope Product Portal' ], status: 'native' } ) ).toBe( 'audio-native' )
        expect( getServiceCardType( { endpoint: '/app/luna-display', name: 'Luna Display', status: 'native' } ) ).toBeNull()
        expect( getServiceCardType( { endpoint: '/app/brainwaves', name: 'Brainwaves', status: 'native' } ) ).toBeNull()
    } )

    it( 'gives native DAWs other than Logic the DAW-neutral card', () => {
        expect( getServiceCardType( { endpoint: '/app/ableton', name: 'Ableton', status: 'native' } ) ).toBe( 'daw-native' )
        expect( getServiceCardType( { endpoint: '/app/avid-pro-tools', name: 'Avid Pro Tools', status: 'native', category: audio } ) ).toBe( 'daw-native' )
        expect( getServiceCardType( { endpoint: '/app/logic-pro', name: 'Logic Pro', status: 'native' } ) ).toBe( 'audio-native' )
        expect( getServiceCardType( { endpoint: '/app/reaper', name: 'REAPER', status: 'rosetta', category: audio } ) ).toBe( 'audio' )
        expect( serviceCards['daw-native'].subhead ).not.toMatch( /logic/i )
        expect( serviceCards['daw-native'].primary.label ).not.toMatch( /logic/i )
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

    it( 'gives every card an experiment id and keeps the four audio headlines', () => {
        for ( const card of Object.values( serviceCards ) ) expect( card.experiment ).toMatch( /^[a-z0-9-]{1,40}$/ )
        expect( serviceCards.audio.experiment ).toBe( 'audio-headlines-v1' )
        expect( serviceCards.audio.variants.map( variant => variant.id ) ).toEqual( [ 'a1', 'b1', 'c1', 'd1' ] )
    } )

    it( 'fills the app name', () => {
        expect( fillServiceCopy( '{app} runs natively. Do your sessions?', { app: 'Logic Pro' } ) ).toBe( 'Logic Pro runs natively. Do your sessions?' )
    } )
} )

describe( 'service pages', () => {
    it( 'lists every page on /services/ and uses offers the Worker accepts', () => {
        const hrefs = servicesIndex.offers.map( offer => offer.href )
        for ( const [ slug, page ] of Object.entries( servicePages ) ) {
            expect( hrefs ).toContain( `/services/${ slug }/` )
            expect( serviceOffers.has( page.offer ), page.offer ).toBe( true )
            expect( page.price ).toBeTruthy()
        }
        expect( servicePages['abandoned-app-revival'].offer ).toBe( 'app-revival' )
        expect( servicePages['abandoned-app-revival'].price ).toMatch( /free/i )
    } )
} )

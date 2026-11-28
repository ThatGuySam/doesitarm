import { describe, expect, it } from 'vitest'

import { apps as revivalApps } from '~/data/revival-apps.json'
import {
    appSlugPattern,
    fillServiceCopy,
    getCardVariants,
    getRevivalRequestPath,
    getServiceCardType,
    isAbandonedListing,
    revivalAllowlist,
    isAudioSearchQuery,
    serviceCards,
    serviceExperiments,
    servicePages,
    servicesIndex
} from '~/helpers/service-offers.js'
import { serviceOffers } from '~/workers/subscriptions/src/services.js'

const audio = { slug: 'music-and-audio-tools' }

describe( 'service card placement', () => {
    it( 'shows the generic audio card on audio tools that are not DAWs', () => {
        expect( getServiceCardType( { endpoint: '/app/native-access', status: 'rosetta', category: audio } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/old-synth', status: 'no', category: audio } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/melodyne', name: 'Melodyne', status: 'native' } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/native-access', name: 'Native Access', status: 'rosetta', category: { slug: 'homebrew' } } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/kontakt-8', name: 'Kontakt 8', status: 'rosetta' } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/izotope-portal', name: 'Portal', aliases: [ 'iZotope Product Portal' ], status: 'native' } ) ).toBe( 'audio' )
        expect( getServiceCardType( { endpoint: '/app/luna-display', name: 'Luna Display', status: 'native' } ) ).toBeNull()
        expect( getServiceCardType( { endpoint: '/app/brainwaves', name: 'Brainwaves', status: 'native' } ) ).toBeNull()
    } )

    it( 'shows the Logic card only on Logic Pro and MainStage', () => {
        expect( getServiceCardType( { endpoint: '/app/logic-pro', name: 'Logic Pro', status: 'native', category: audio } ) ).toBe( 'logic-native' )
        expect( getServiceCardType( { endpoint: '/app/mainstage', name: 'MainStage', status: 'native' } ) ).toBe( 'logic-native' )
    } )

    it( 'gives every other DAW the DAW card, native or not', () => {
        expect( getServiceCardType( { endpoint: '/app/ableton', name: 'Ableton', status: 'native' } ) ).toBe( 'daw' )
        expect( getServiceCardType( { endpoint: '/app/avid-pro-tools', name: 'Avid Pro Tools', status: 'native', category: audio } ) ).toBe( 'daw' )
        expect( getServiceCardType( { endpoint: '/app/reaper', name: 'REAPER', status: 'rosetta', category: audio } ) ).toBe( 'daw' )
        expect( getServiceCardType( { endpoint: '/app/audacity', name: 'Audacity', status: 'rosetta', category: audio } ) ).toBe( 'daw' )
        expect( getServiceCardType( { endpoint: '/app/some-cubase-build', name: 'Cubase Pro 13', status: 'no' } ) ).toBe( 'daw' )
    } )

    it( 'never shows Logic copy outside the Logic card', () => {
        for ( const type of [ 'audio', 'daw' ] ) {
            const card = serviceCards[ type ]
            expect( card.subhead ).not.toMatch( /logic/i )
            expect( card.primary.label ).not.toMatch( /logic/i )
            for ( const variant of getCardVariants( type ) ) expect( variant.headline, variant.id ).not.toMatch( /logic/i )
        }
    } )

    it( 'shows the revival card on reviewed abandoned apps and listings that say discontinued', () => {
        expect( getServiceCardType( { endpoint: '/app/true-fi', status: 'no', category: { slug: 'entertainment-and-media-apps' } } ) ).toBe( 'revival' )
        for ( const slug of [ 'atom', 'sequel-pro', 'azure-data-studio', 'finale-music', 'saffire-mixcontrol' ] ) {
            expect( getServiceCardType( { endpoint: `/app/${ slug }`, status: 'rosetta' } ), slug ).toBe( 'revival' )
        }
        expect( getServiceCardType( { endpoint: '/app/old-tool', status: 'rosetta', text: '✳️ Works via Rosetta 2; no longer maintained' } ) ).toBe( 'revival' )
        expect( getServiceCardType( { endpoint: '/app/old-ide', status: 'native', text: '✅ Native in 2022; Old IDE is retired' } ) ).toBe( 'revival' )
        expect( getServiceCardType( { endpoint: '/app/some-other-app', status: 'no', category: { slug: 'entertainment-and-media-apps' } } ) ).toBeNull()
        expect( getServiceCardType( { endpoint: '/app/some-other-app', status: 'no', text: '🚫 No, not yet supported' } ) ).toBeNull()
    } )

    it( 'keeps the revival card off maintained apps the research list rejected', () => {
        for ( const slug of [ 'final-cut-pro', 'quicken', 'labview', 'nisus-writer-pro', 'brackets' ] ) {
            expect( revivalAllowlist, slug ).not.toContain( slug )
            expect( isAbandonedListing( { endpoint: `/app/${ slug }`, text: '✅ Yes, Native Apple Silicon Support' } ), slug ).toBe( false )
        }
        expect( getServiceCardType( { endpoint: '/app/avid-pro-tools', name: 'Avid Pro Tools', status: 'native' } ) ).toBe( 'daw' )
    } )

    it( 'keeps a reason and evidence link for every reviewed revival app', () => {
        expect( revivalApps.length ).toBeGreaterThanOrEqual( 20 )
        expect( new Set( revivalAllowlist ).size ).toBe( revivalAllowlist.length )
        for ( const app of revivalApps ) {
            expect( app.slug, app.slug ).toMatch( appSlugPattern )
            expect( app.reason, app.slug ).toBeTruthy()
            expect( app.evidence, app.slug ).toMatch( /^https:\/\// )
        }
    } )

    it( 'links the revival card to a prefilled request page', () => {
        expect( getRevivalRequestPath( 'true-fi' ) ).toBe( '/services/abandoned-app-revival/?app=true-fi' )
        expect( getRevivalRequestPath( '../x' ) ).toBe( '/services/abandoned-app-revival/' )
        expect( getRevivalRequestPath() ).toBe( '/services/abandoned-app-revival/' )
        expect( serviceCards.revival.secondary.href ).toBe( '/services/abandoned-app-revival/' )
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
    it( 'has unique variant ids per experiment and short copy', () => {
        for ( const [ id, experiment ] of Object.entries( serviceExperiments ) ) {
            const ids = experiment.variants.map( variant => variant.id )
            expect( new Set( ids ).size, id ).toBe( ids.length )
            expect( ids, id ).toContain( experiment.control )
        }

        for ( const [ type, card ] of Object.entries( serviceCards ) ) {
            expect( card.subhead.length ).toBeLessThanOrEqual( 80 )
            for ( const variant of getCardVariants( type ) ) {
                // About two lines at 400px; the {app} name adds a little
                expect( variant.headline.length, variant.id ).toBeLessThanOrEqual( 56 )
            }
        }
    } )

    it( 'uses the v2 experiments, d1 as the audio control and retires the old ready and timing headlines', () => {
        for ( const card of Object.values( serviceCards ) ) {
            expect( card.experiment ).toMatch( /^[a-z0-9-]{1,40}$/ )
            expect( serviceExperiments[ card.experiment ] ).toBeTruthy()
        }
        expect( serviceCards.audio.experiment ).toBe( 'audio-headlines-v2' )
        expect( serviceCards.daw.experiment ).toBe( 'audio-headlines-v2' )
        expect( serviceCards['logic-native'].experiment ).toBe( 'logic-headlines-v2' )
        expect( serviceExperiments['audio-headlines-v2'].control ).toBe( 'd1' )
        expect( getCardVariants( 'audio' )[0] ).toEqual( { id: 'd1', headline: 'Check your plug-ins before you upgrade.' } )

        const allIds = Object.values( serviceExperiments ).flatMap( experiment => experiment.variants.map( variant => variant.id ) )
        for ( const retired of [ 'b1', 'c1', 'nb1', 'nc1' ] ) expect( allIds ).not.toContain( retired )
        for ( const text of Object.values( serviceExperiments ).flatMap( experiment => experiment.variants.map( variant => variant.headline ) ) ) {
            expect( text ).not.toMatch( /apple silicon ready|macos 28/i )
        }
    } )

    it( 'gives every card in an experiment the same variant ids, so the sticky choice fits all of them', () => {
        const byExperiment = {}
        for ( const type of Object.keys( serviceCards ) ) {
            const ids = getCardVariants( type ).map( variant => variant.id ).join( ' ' )
            const experiment = serviceCards[ type ].experiment
            if ( !byExperiment[ experiment ] ) byExperiment[ experiment ] = ids
            expect( ids, type ).toBe( byExperiment[ experiment ] )
        }
    } )

    it( 'names the app only on the DAW card', () => {
        const audioMove = getCardVariants( 'audio' ).find( variant => variant.id === 'mv1' )
        const dawMove = getCardVariants( 'daw' ).find( variant => variant.id === 'mv1' )
        expect( audioMove.headline ).not.toContain( '{app}' )
        expect( fillServiceCopy( dawMove.headline, { app: 'REAPER' } ) ).toBe( 'Moving your REAPER projects to a new Mac?' )
        for ( const variant of getCardVariants( 'audio' ) ) expect( variant.headline ).not.toContain( '{app}' )
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

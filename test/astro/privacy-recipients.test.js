import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { JSDOM } from 'jsdom'
import { expect, it, vi } from 'vitest'

import { dataRecipients } from '../../helpers/data-recipients.js'
import Privacy from '../../src/pages/privacy.astro'

vi.mock( '~/src/layouts/default.astro', async () => {
    const { createComponent, renderSlot } = await import( 'astro/runtime/server/index.js' )
    return { default: createComponent( ( result, _props, slots ) => renderSlot( result, slots.default ) ) }
} )

it( 'renders all data recipients and their privacy policy links on the privacy page', async () => {
    const container = await AstroContainer.create()
    const html = await container.renderToString( Privacy, { request: new Request( 'https://doesitarm.com/privacy' ) } )
    const { window } = new JSDOM( html )
    const links = Array.from( window.document.querySelectorAll( '[aria-labelledby="data-recipients"] tbody th a' ) )
    expect( links ).toHaveLength( dataRecipients.length )
    for ( const [ index, recipient ] of dataRecipients.entries() ) {
        for ( const field of [ 'name', 'purpose', 'data', 'cookies', 'euConsent' ] ) {
            expect( recipient[field]?.trim() ).toBeTruthy()
        }
        expect( recipient.surfaces.length ).toBeGreaterThan( 0 )
        expect( [ 'necessary', 'analytics', 'advertising' ] ).toContain( recipient.consentCategory )
        expect( new URL( recipient.privacyPolicy ).protocol ).toBe( 'https:' )
        expect( links[index].textContent ).toBe( `${ recipient.name } privacy policy` )
        expect( links[index].getAttribute( 'href' ) ).toBe( recipient.privacyPolicy )
    }
    window.close()
} )

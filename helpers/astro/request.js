import { getNetlifyRedirect } from '~/helpers/config-node.js'

export async function catchRedirectResponse ( Astro ) {
    const requestUrl = new URL( Astro.request.url )

    const netlifyRedirectUrl = await getNetlifyRedirect( requestUrl.pathname )

    // console.log('netlifyRedirectUrl', netlifyRedirectUrl)

    if ( netlifyRedirectUrl !== null ) {
        return Astro.redirect( netlifyRedirectUrl.to )
    }

    return null
}



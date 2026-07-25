function escapeXml ( value ) {
    return value
        .replaceAll( '&', '&amp;' )
        .replaceAll( '<', '&lt;' )
        .replaceAll( '>', '&gt;' )
        .replaceAll( '"', '&quot;' )
        .replaceAll( '\'', '&apos;' )
}

const deviceUrlPattern = /<url>(?:(?!<\/url>)[\s\S])*?<loc>[^<]*\/device\/[^<]*<\/loc>(?:(?!<\/url>)[\s\S])*?<\/url>/gu

export function replaceDeviceUrlsInSitemap ( sitemapXml, deviceUrls ) {
    if ( !sitemapXml.includes( '</urlset>' ) ) {
        throw new Error( 'Cannot update device URLs in a sitemap without a urlset root' )
    }

    const withoutExistingDevices = sitemapXml.replace( deviceUrlPattern, '' )
    const deviceEntries = deviceUrls
        .map( url => `<url><loc>${ escapeXml( url ) }</loc></url>` )
        .join( '' )

    return withoutExistingDevices.replace( '</urlset>', `${ deviceEntries }</urlset>` )
}

import TOML from '@iarna/toml'
import fs from 'fs-extra'

import pkg from '~/package.json'
import { getSiteUrl } from '~/helpers/url.js'
import { getRouteType } from '~/helpers/app-derived.js'


export const siteUrl = getSiteUrl()

export const nuxtHead = {
    // this htmlAttrs you need
    htmlAttrs: {
        lang: 'en',
    },
    title: 'Does It ARM',
    description: pkg.description,

    meta: [
        { charset: 'utf-8' },
        {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1'
        },
        {
            hid: 'description',
            name: 'description',
            content: pkg.description
        },
        {
            'property':  'og:image',
            'content': `${ siteUrl }/images/og-image.png`
        },
        {
            'property':  'og:image:width',
            'content': '1200'
        },
        {
            'property':  'og:image:height',
            'content': '627'
        },
        {
            'property':  'og:image:alt',
            'content': 'Does It ARM Logo'
        },

        // Twitter Card
        {
            'property':  'twitter:card',
            'content': 'summary'
        },
        {
            'property':  'twitter:title',
            'content': 'Does It ARM'
        },
        {
            'property':  'twitter:description',
            'content': pkg.description
        },
        {
            'property':  'twitter:url',
            'content': `${ siteUrl }`
        },
        {
            'property':  'twitter:image',
            'content': `${ siteUrl }/images/mark.png`
        }
    ],
    link: [
        // Favicon
        {
            rel: 'icon',
            type: 'image/x-icon',
            href: '/favicon.ico'
        },

        // Gtag Preconnect
        {
            rel: 'preconnect',
            href: 'https://www.googletagmanager.com'
        },

        // Carbon Preconnects
        {
            rel: 'preconnect',
            href: 'https://cdn.carbonads.com'
        },
        {
            rel: 'preconnect',
            href: 'https://srv.carbonads.net'
        },
        {
            rel: 'preconnect',
            href: 'https://cdn4.buysellads.net'
        },
    ],

    script: [
        // // Carbon Ads
        // // https://sell.buysellads.com/zones/1294/ad-tags#z=js
        // {
        //     // <script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom" id="_carbonads_js"></script>
        //     src: 'https://cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom',
        //     async: true,
        //     type: 'text/javascript',
        //     id: '_carbonads_js',
        //     class: 'include-on-static carbon-inline-wide',
        //     body: true
        // }
    ]
}



export async function getNetlifyConfig () {
    const configPath = './netlify.toml'
    const tomlContent = await fs.readFile(configPath, 'utf-8')
    const netlifyConfig = TOML.parse(tomlContent)

    // console.log('netlifyConfig', netlifyConfig)
    // console.log('tomlContent', tomlContent)

    return netlifyConfig
}

export async function getNetlifyRedirect ( path ) {
    // Check if the path is valid
    // by checking if it starts with a slash
    // and does not end with a slash
    // if ( !path.startsWith('/') || path.endsWith('/') ) {
    //     throw new Error(`Invalid Netlify redirect path: ${ path }`)
    // }

    const netlifyConfig = await getNetlifyConfig()
    const redirects = netlifyConfig.redirects

    for ( const redirect of redirects ) {
        // Check if the from path is valid
        // by checking if it starts with a slash
        // and does not end with a slash
        if ( !redirect.from.startsWith('/') || redirect.from.endsWith('/') ) {
            throw new Error(`Invalid Netlify redirect.from path: ${ redirect.from }`)
        }

        if ( redirect.from === path ) {
            return redirect
        }
    }

    return null
}

export function makeTitle ( listing ) {
    return `Does ${ listing.name } work on Apple Silicon? - ${ nuxtHead.title }`
}

export function makeDescription ( listing ) {
    return `Latest reported support status of ${ listing.name } on Apple Silicon and ${ this.$config.processorsVerbiage } Processors.`
}

function makeTag ( tag, tagName = 'meta' ) {

    const attributes = Object.entries(tag).map( ([ name, value ]) => `${name}="${value}"` ).join(' ')

    return `<${tagName} ${attributes}>`
}

function mapMetaTag ( tag ) {

    if ( tag.hasOwnProperty('property') ) {
        return [
            `property-${tag.property}`,
            makeTag(tag)
        ]
    }

    if ( tag.hasOwnProperty('name') ) {
        return [
            `name-${tag.name}`,
            makeTag(tag)
        ]
    }

    if ( tag.hasOwnProperty('charset') ) {
        return [
            'charset',
            makeTag(tag)
        ]
    }
}

function mapLinkTag ( tag ) {
    return [
        `type-${tag.type}`,
        makeTag(tag, 'link')
    ]
}


export class PageHead {

    constructor ( options = {} ) {
        const {
            title,
            description,
            meta = [],
            link = [],
            structuredData = null,

            domain = getSiteUrl(),
            pathname = '',
        } = options

        this.title = title
        this.description = description
        this.meta = meta
        this.link = link
        this.structuredData = structuredData

        this.domain = domain
        this.pathname = pathname
    }

    get pageUrl () {
        const urlInstance = new URL( this.domain )

        urlInstance.pathname = this.pathname

        return urlInstance
    }

    get pageUrlString () {
        return this.pageUrl.toString()
    }

    get routeType () {
        if ( this.pathname.length < 2 ) return 'none'

        return getRouteType( this.pathname )
    }

    get defaultMeta () {
        return nuxtHead.meta
    }

    get defaultMetaTags () {
        return Object.fromEntries( nuxtHead.meta.map( mapMetaTag ) )
    }

    get defaultLinkTags () {
        return Object.fromEntries( nuxtHead.link.map( mapLinkTag ) )
    }

    get pageMeta () {
        // console.log('this.defaultMeta', this.defaultMeta)
        return [
            ...this.defaultMeta,

            {
                'property':  'twitter:url',
                'content': this.pageUrlString
            },

            ...this.meta
        ]
    }

    get metaTags () {

        const metaTags = {
            // ...this.defaultMeta,
            // 'property-twitter:url': `<meta property="twitter:url" content="${ this.pageUrlString }">`,
            ...Object.fromEntries( this.pageMeta.map(mapMetaTag) )
        }

        // Get description from data
        if ( this.description ) {
            // Set meta description
            metaTags['name-description'] = `<meta hid="description" name="description" content="${ this.description }">`
            // Set twitter description
            metaTags['property-twitter:description'] = `<meta hid="twitter:description" property="twitter:description" content="${ this.description }">`
        }

        // Get title from data
        if ( this.title ) {
            // Set twitter title
            metaTags['property-twitter:title'] = `<meta hid="twitter:title" property="twitter:title" content="${ this.title }">`
        }


        return metaTags
    }


    get metaMarkup () {
        return Object.values( this.metaTags ).join('')
    }

    get linkTags () {

        const linkTags = {
            ...this.defaultLinkTags,
            ...Object.fromEntries( this.link.map( mapLinkTag ) )
        }

        return linkTags
    }

    get linkMarkup () {
        return Object.values( this.linkTags ).join('')
    }

    get metaAndLinkMarkup () {
        return [
            this.metaMarkup,
            this.linkMarkup
        ].join('')
    }


    get structuredDataMarkup () {
        // console.log( 'this.routeType', this.routeType, this.pathname )

        const hasStructuredData = this.structuredData !== null
        // Route is primarily for video
        const videoRouteType = [ 'tv', 'benchmarks' ].includes( this.routeType )

        if ( hasStructuredData && videoRouteType ) {
            const structuredDataJson = JSON.stringify( this.structuredData )

            return `<script type="application/ld+json">${ structuredDataJson }</script>`
        }


        return ''
    }

    get allHeadMarkup () {
        return [
            this.metaMarkup,
            this.linkMarkup,
            this.structuredDataMarkup
        ].join('')
    }


}

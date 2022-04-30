import nuxtConfig from '~/nuxt.config.js'


export const nuxtHead = nuxtConfig.head

export function makeTitle ( listing ) {
    return `Does ${ listing.name } work on Apple Silicon? - ${ nuxtHead.title }`
}

export function makeDescription ( listing ) {
    return `Latest reported support status of ${ listing.name } on Apple Silicon and Apple M1 Pro and M1 Max Processors.`
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

            domain,
            pathname,
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

        if ( structuredData === null ) return ''

        const structuredDataJson = JSON.stringify( structuredData )

        return `<script type="application/ld+json">${ structuredDataJson }</script>`
    }


}

import fs from 'fs'
import { JSDOM } from 'jsdom'

import config from '../nuxt.config'


console.log('Running Default Layout file')


const year = new Date().getFullYear()

const makeTag = ( tag, tagName = 'meta') => {

    const attributes = Object.entries(tag).map( ([ name, value ]) => `${name}="${value}"` ).join(' ')

    return `<${tagName} ${attributes}>`
}

const mapMetaTag = ( tag ) => {

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

const mapLinkTag = ( tag ) => {
    return [
        `type-${tag.type}`,
        makeTag(tag, 'link')
    ]
}


const getNuxtDefaultLayoutHtml = () => {
    const fileContents = fs.readFileSync('./dist/layout-template/index.html', { encoding: "UTF-8" })

    return fileContents
}

const templateVar = string => `--- template-var ${string} ---`

const cleanNuxtLayout = ( layout ) => {

    const document = layout.window.document

    // Strip out existing meta
    Array.from(document.querySelectorAll('head > meta')).forEach( domNode => {
        domNode.remove()
    })

    // Strip out existing preloads
    Array.from(document.querySelectorAll('link[rel="preload"]')).forEach( domNode => {
        domNode.remove()
    })

    // Strip out existing scripts
    Array.from(document.querySelectorAll('script[src*=".js"]')).forEach( domNode => {
        domNode.remove()
    })

    // Convert subscribe to iframe embed
    Array.from(document.querySelectorAll('form.all-updates-subscribe')).forEach( domNode => {
        const subscribeEmbed = document.createElement('iframe')
        subscribeEmbed.setAttribute('src', '/embed-subscribe')
        // https://web.dev/iframe-lazy-loading/
        subscribeEmbed.setAttribute('loading', 'lazy')
        subscribeEmbed.style.width = '350px'
        subscribeEmbed.style.height = '150px'

        domNode.parentNode.replaceChild(subscribeEmbed, domNode)
    })


    // Set page title
    document.title = templateVar('title')

    // Set link tags
    document.querySelector('title').insertAdjacentHTML('afterend', templateVar('link-tags') )

    // Add meta tags after title node
    document.querySelector('title').insertAdjacentHTML('afterend', templateVar('meta-tags') )

    // Set page css
    // document.querySelector('head').insertAdjacentHTML('beforeend', this.getCss() )

    // Set page content
    document.querySelector('.app-main').innerHTML = templateVar('main-content')//content

    // Set js before end of body
    // `<script>${ this.getJs() }</script>`
    document.querySelector('body').insertAdjacentHTML('beforeend', templateVar('scripts') )

    return layout
}

let nuxtLayoutHtml = null
const parseDefaultLayoutDom = () => {
    if ( nuxtLayoutHtml === null ) {
        nuxtLayoutHtml = getNuxtDefaultLayoutHtml()
    }
    // const html = getNuxtDefaultLayoutHtml()

    // Build initial dom from the Layout
    const dom = new JSDOM( nuxtLayoutHtml )

    const cleanedLayout = cleanNuxtLayout( dom )

    return cleanedLayout
}

// Buld data that only needs to run once
const defaultMeta = Object.fromEntries(config.head.meta.map( mapMetaTag ))

const defaultLinkTags = Object.fromEntries(config.head.link.map( mapLinkTag ))

const masterLayoutDomString = parseDefaultLayoutDom().serialize()

class DefaultLayout {

    generateMetaTags = function ( renderData ) {

        const {
            title = null,
            description = null,
            meta: pageMeta = []
        } = renderData

        // console.log('renderData', Object.keys(renderData))

        const meta = {
            ...defaultMeta,
            'property-twitter:url': `<meta property="twitter:url" content="${process.env.URL}${this.page.url}">`,
            ...Object.fromEntries( pageMeta.map(mapMetaTag) )
        }

        // console.log('renderData.description', renderData.description)

        // if set
        // get description from data
        if ( description ) {
            // Set meta description
            meta['name-description'] = `<meta hid="description" name="description" content="${ description }">`
            // Set twitter description
            meta['property-twitter:description'] = `<meta hid="twitter:description" property="twitter:description" content="${ description }">`
        }

        // if set
        // get title from data
        if ( title ) {
            // Set twitter title
            meta['property-twitter:title'] = `<meta hid="twitter:title" property="twitter:title" content="${ title }">`
        }


        return Object.values(meta).join('')
    }

    generateLinkTags = ( pageLinkTags = [] ) => {

        const linkTags = {
            ...defaultLinkTags,
            ...Object.fromEntries(pageLinkTags.map( mapLinkTag ))
        }

        return Object.values( linkTags ).join('')
    }


    async render( data ) {

        // return nuxtLayoutHtml

        // console.log('Running DefaultLayout render')

        const {
            content,
            title = null,
            // description = null
        } = data

        const pageTitle = title || this.getNuxt().head.title

        let workingLayoutString = masterLayoutDomString

        // Set page title
        // pageTitle
        workingLayoutString = workingLayoutString.replace( templateVar('title'), pageTitle )

        // Set link tags
        // this.generateLinkTags()
        workingLayoutString = workingLayoutString.replace( templateVar('link-tags'), this.generateLinkTags() )

        // Add meta tags after title node
        // this.generateMetaTags( data )
        workingLayoutString = workingLayoutString.replace( templateVar('meta-tags'), this.generateMetaTags( data ) )

        // Set page css
        // document.querySelector('head').insertAdjacentHTML('beforeend', this.getCss() )

        // Set page content
        // content
        workingLayoutString = workingLayoutString.replace( templateVar('main-content'), content )

        // Set js before end of body
        // `<script>${ this.getJs() }</script>`
        workingLayoutString = workingLayoutString.replace( templateVar('scripts'), `<script>${ this.getJs() }</script>` )


        // Return stringified html for page
        return workingLayoutString

    }
}

module.exports = DefaultLayout

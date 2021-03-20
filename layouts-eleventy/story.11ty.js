import config from '../nuxt.config'
import {
    makeFullUrlFromPath,

    mapMetaTag,
    mapLinkTag,
    parseDefaultLayoutDom,
    templateVar
} from './default.11ty.js'


console.log('Running Story Layout file')


// Buld data that only needs to run once
const defaultMeta = Object.fromEntries(config.head.meta.map( mapMetaTag ))

const defaultLinkTags = Object.fromEntries(config.head.link.map( mapLinkTag ))

const masterLayoutDomString = parseDefaultLayoutDom({
    replaceElements: {
        // Replace root nuxt element
        // and get rid of normal layout
        '#__nuxt': templateVar('main-content')
    }
}).serialize()

class StoryLayout {

    generateMetaTags = function ( renderData ) {

        const {
            title = null,
            description = null,
            pageMeta = []
        } = renderData

        // https://amp.dev/documentation/components/amp-story/#metadata-guidelines
        const meta = {
            ...defaultMeta,
            'property-twitter:url': /* html */`<meta property="twitter:url" content="${ makeFullUrlFromPath( this.page.url ) }">`,
            'amp-story-generator-name': /* html */`<meta name="amp-story-generator-name" content="DoesItARM" />`,
            'amp-story-generator-version': /* html */`<meta name="amp-story-generator-version" content="1.0" />`,

            'og:url': /* html */`<meta property="og:url" content="${ makeFullUrlFromPath( renderData.page.url ) }" />`,
            'twitter:creator': /* html */`<meta property="twitter:site" content="@DoesItARM" />`,
            'title': /* html */`<meta property="title" content="${ renderData.title }" />`,
            'og:title': /* html */`<meta property="og:title" content="${ renderData.title }" />`,
            // 'twitter:title': /* html */`<meta property="twitter:title" content="${ renderData.title }" />`, // Already included

            // Example: <meta property="og:modified_time" content="2021-03-13T00:00:00.000Z" />
            'og:modified_time': /* html */`<meta property="og:modified_time" content="${ renderData.lastUpdatedDate.toISOString() }" />`,

            'og:type': /* html */`<meta property="og:type" content="article" />`,

            ...Object.fromEntries( pageMeta.map(mapMetaTag) )
        }

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

        const layoutLinkTags = {
            ampCorePreload: /* html */`<link href="https://cdn.ampproject.org/v0.js" rel="preload" as="script" />`,

            icon: /* html */`<link rel="shortcut icon" href="/images/mark.png" type="image/x-icon" />`,
            canonical: /* html */`<link rel="canonical" href="${ makeFullUrlFromPath( this.page.url ) }">`,

            ampYoutubeStylesheet: /* html */`<link rel="stylesheet" href="https://cdn.ampproject.org/v0/amp-youtube-1.0.css" />`,
        }

        const linkTags = {
            ...defaultLinkTags,
            ...layoutLinkTags,
            ...Object.fromEntries(pageLinkTags.map( mapLinkTag ))
        }

        return Object.values( linkTags ).join('')
    }

    defaultHeaderScripts = () => {
        return {
            ampCore: /* html */`<script async src="https://cdn.ampproject.org/v0.js"></script>`,
            ampStoryElement: /* html */`<script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>`,
            ampYoutubeElement: /* html */`<script async custom-element="amp-youtube" src="https://cdn.ampproject.org/v0/amp-youtube-1.0.js"></script>`,
        }
    }

    defaultHeaderStyleTags = () => {
        return {
            ampBoilerplate: /* html */`<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>`,
            // ampCore: /* html */`<script async src="https://cdn.ampproject.org/v0.js"></script>`,
        }
    }

    async render( data ) {

        // return nuxtLayoutHtml

        // console.log('Running StoryLayout render')

        const {
            content,
            title = null,
            headerScripts = {},
            jsonLd
            // description = null
        } = data

        const pageTitle = title || this.getNuxt().head.title

        const headerScriptsHtml = Object.values( {
            ...this.defaultHeaderScripts(),
            jsonLd: /* html */`<script type="application/ld+json">${ JSON.stringify( jsonLd ) }</script>`
        } ).join('')

        const headerStylesHtml = Object.values( {
            ...this.defaultHeaderStyleTags()
        } ).join('')

        let workingLayoutString = masterLayoutDomString

        // Set as an amp html document
        workingLayoutString = workingLayoutString.replace( '<html ', '<html amp ' )

        // Set page title
        // pageTitle
        workingLayoutString = workingLayoutString.replace( templateVar('title', false), pageTitle )

        // Set link tags
        // this.generateLinkTags()
        workingLayoutString = workingLayoutString.replace( templateVar('link-tags'), this.generateLinkTags() )

        // Add meta tags after title node
        // this.generateMetaTags( data )
        workingLayoutString = workingLayoutString.replace( templateVar('meta-tags'), this.generateMetaTags( data ) )

        // Add header scripts
        workingLayoutString = workingLayoutString.replace( templateVar('header-scripts'), headerScriptsHtml )

        // Add  header-styles
        workingLayoutString = workingLayoutString.replace( templateVar('header-styles'), headerStylesHtml )

        // Make the Tailwind css our amp-custom style tag
        // https://amp.dev/documentation/guides-and-tutorials/develop/style_and_layout/
        workingLayoutString = workingLayoutString.replace( '<style data-vue-ssr-id', '<style amp-custom data-vue-ssr-id' )

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

module.exports = StoryLayout

import config from '../nuxt.config'

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

const defaultMeta = Object.fromEntries(config.head.meta.map( mapMetaTag ))

const defaultLinkTags = Object.fromEntries(config.head.link.map( mapLinkTag ))

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


    render( data ) {

        const {
            content,
            title = null,
            description = null
        } = data

        // Setup inline tailwind
        this.usingComponent( 'static/tailwind.css' )
        // Setup inline tailwind
        this.usingComponent( 'node_modules/@fontsource/inter/variable.css' )

        return /* html */`
            <!doctype html>
            <html lang="${ this.getNuxt().head.htmlAttrs.lang }">
                <head>
                    <title>${ title || this.getNuxt().head.title }</title>

                    ${ this.generateMetaTags( data ) }

                    ${ this.generateLinkTags() }

                    <!-- {{ Script Preloads }} -->

                    <style>
                        ${ this.getCss() }
                    </style>

                    <!-- {{ External Styles }} -->

                </head>
                <body>
                    <div id="__nuxt">
                        <!---->
                        <div id="__layout">
                            <div class="app-wrapper text-gray-300 bg-gradient-to-bl from-dark to-darker bg-fixed">
                                <nav class="fixed top-0 left-0 right-0 z-navbar">
                                    <div class="max-w-7xl mx-auto px-4 lg:px-8">
                                        <div class="flex justify-between h-16">
                                            <div class="flex">
                                                <div class="-ml-2 mr-2 flex items-center lg:hidden">
                                                    <button aria-expanded="false" aria-label="Main menu" class="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:bg-gray-700 focus:text-white transition duration-150 ease-in-out">
                                                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6">
                                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                                        </svg>
                                                        <!---->
                                                    </button>
                                                </div>
                                                <div class="flex-shrink-0 flex items-center text-4xl lg:text-5xl py-3">
                                                    <div>🦾</div>
                                                </div>
                                                <div class="hidden lg:ml-6 lg:flex lg:items-center space-x-4"><a href="/" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Home </a><a href="/categories" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Categories </a><a href="/benchmarks" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Benchmarks </a><a href="/kind/homebrew" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Homebrew </a><a href="/games" class="px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow">Games</a></div>
                                            </div>
                                            <div class="flex items-center">
                                                <div class="flex-shrink-0"><a href="https://www.producthunt.com/posts/does-it-arm-benchmarks?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-does-it-arm-benchmarks" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=279410&theme=light" alt="Does It ARM Benchmarks - Curated App Benchmark Videos for Apple Silicon and Apple M1 | Product Hunt" width="200" height="43" style="width: 200px; height: 43px;"></a></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="lg:hidden hidden">
                                        <div class="px-2 pt-2 pb-3 lg:px-3"><a href="/" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Home </a><a href="/categories" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Categories </a><a href="/benchmarks" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Benchmarks </a><a href="/kind/homebrew" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Homebrew </a><a href="/games" class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700">Games</a></div>
                                        <hr>
                                    </div>
                                </nav>
                                <div class="app-main min-h-screen flex items-center">

                                    ${ content }

                                </div>
                                <footer>
                                    <div class="max-w-screen-xl mx-auto py-12 px-4 overflow-hidden space-y-8 sm:px-6 lg:px-8">
                                        <div class="mt-8 flex justify-center space-x-6">
                                            <div class="flex flex-col items-center space-y-4">
                                                <div>
                                                    <div>
                                                        <form class="all-updates-subscribe text-xs relative">
                                                            <!---->
                                                            <div class="mt-1 relative rounded-md shadow-sm">
                                                                <!----> <input id="all-updates-subscribe-17332" placeholder="Send me regular app updates" aria-label="Send me regular app updates" name="all-updates-subscribe" type="email" required class="form-input block w-full rounded-md py-1 neumorphic-shadow bg-darker placeholder-white text-center border border-transparent px-3" style="width: 240px;">
                                                            </div>
                                                        </form>
                                                    </div>
                                                    <!---->
                                                </div>
                                            </div>
                                        </div>
                                        <p class="mt-8 text-center text-base leading-6 text-gray-400">© ${ year } ${ this.getNuxt().head.title } All rights reserved.</p>
                                    </div>
                                </footer>
                            </div>
                        </div>
                    </div>

                    <script>
                        ${ this.getJs() }
                    </script>
                </body>
            </html>
        `;
    }
}

module.exports = DefaultLayout

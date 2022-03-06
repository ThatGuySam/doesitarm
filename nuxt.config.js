import { promises as fs } from 'fs'

import pkg from './package'


export default {
    target: 'static',

    publicRuntimeConfig: {
        allUpdateSubscribe: process.env.ALL_UPDATE_SUBSCRIBE,
        testResultStore: process.env.TEST_RESULT_STORE,
        siteUrl: process.env.URL
    },

    /*
    ** Hooks
    * https://nuxtjs.org/api/configuration-hooks/
    */
    hooks: {
        // build: {
        //     before: storeAppLists
        // },
        // generate: {
        //     before: storeAppLists
        // }
    },

    generate: {
        crawler: false,

        // https://nuxtjs.org/docs/2.x/configuration-glossary/configuration-generate#cache
        cache: false,
        routes() {
            return fs.readFile('./static/nuxt-endpoints.json', 'utf-8')
                .then( endpointsJson => {
                    return JSON.parse(endpointsJson)
                })
        }
    },

    /*
    ** Headers of the page
    */
    head: {
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
                'content': `${process.env.URL}/images/og-image.png`
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
                'content': `${process.env.URL}`
            },
            {
                'property':  'twitter:image',
                'content': `${process.env.URL}/images/mark.png`
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
        ],

        script: [
            // Carbon Ads
            // https://sell.buysellads.com/zones/1294/ad-tags#z=js
            {
                // <script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom" id="_carbonads_js"></script>
                src: 'https://cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom',
                async: true,
                type: 'text/javascript',
                id: '_carbonads_js',
                class: 'include-on-static',
                body: true
            }
        ]
    },

    /*
    ** Customize the progress-bar color
    */
    loading: { color: '#fff' },

    /*
    ** Global CSS
    */
    // css: ['~/assets/css/tailwind.css'],

    /*
    ** Plugins to load before mounting the App
    */
    plugins: [
        '@/plugins/gtag'
    ],

    /*
    ** Nuxt.js modules
    */

    modules: [
        '@nuxtjs/sitemap'
    ],

    sitemap: {
        hostname: 'https://doesitarm.com',
        routes: async () => {
            // Get routes from previous build
            const sitemapEndpoints = await fs.readFile('./static/sitemap-endpoints.json', 'utf-8')
                .then( endpointsJson => {
                    return JSON.parse(endpointsJson)
                })

            // console.log('Total Sitemap Endpoints', sitemapEndpoints.length)

            return sitemapEndpoints.map( endpoint => endpoint.route )
        }
    },

    buildModules: [
        '@nuxt/postcss8',
        '@nuxtjs/tailwindcss'
    ],

    /*
    ** Build configuration
    */
    build: {
        // parallel: true,
        // hardSource: true,
        cache: false,
        html: {
            minify: {
                minifyCSS: false,
                minifyJS: false,
                collapseWhitespace: true
            }
        },
        /*
        ** You can extend webpack config here
        */
        extend(config, ctx) {

            // Client
            if (ctx.isClient) {
                // Push meta import rule for zip.js
                config.module.rules.push({
                    test: /\.js$/,
                    loader: require.resolve('@open-wc/webpack-import-meta-loader')
                })
            }

            // Run ESLint on save
            if (ctx.isDev && ctx.isClient) {

                config.module.rules.push({
                    enforce: 'pre',
                    test: /\.(js|vue)$/,
                    loader: 'eslint-loader',
                    exclude: /(node_modules)/
                })

                config.node = {
                    fs: "empty"
                }

            }
        }
    }
}

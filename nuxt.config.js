import { promises as fs } from 'fs'

import pkg from './package'

const { cacheAndCopy } = require('./cache-me.js')

export default {
    target: 'static',

    publicRuntimeConfig: {
        allUpdateSubscribe: process.env.ALL_UPDATE_SUBSCRIBE,
        testResultStore: process.env.TEST_RESULT_STORE
    },

    /*
    ** Hooks
    * https://nuxtjs.org/api/configuration-hooks/
    */
    hooks: {
        // build: {
        //     before: storeAppLists
        // },
        generate: {
            // before: storeAppLists
            async done() {
                console.log('Starting Netlify Cache')
                await cacheAndCopy()
                console.log('Finished Netlify Cache')
            }
        }
    },

    generate: {
        crawler: false,
        cache: {
            ignore: [
                // When something changed in the docs folder, do not re-build via webpack
                'assets'
            ]
        },
        async routes () {

            const additionalRoutes = []
            const oldRoutesJsonPath = './dist/nuxt-endpoints.json'

            const noOldRoutesFound = await fs.stat( './dist/index.html' )
                .then(stats => {
                    console.log( 'stats', stats )
                    return false
                })
                .catch(() => true)

            const freshRoutesList = await fs.readFile('./static/nuxt-endpoints.json', 'utf-8')
                .then( endpointsJson => {
                    return JSON.parse(endpointsJson)
                })

            if ( noOldRoutesFound ) {
                console.log('No old routes found: Building all routes')
                return freshRoutesList
            }
            console.log('Old routes found')

            // Get routes from previous build
            const oldRoutesList = await fs.readFile(oldRoutesJsonPath, 'utf-8')
                .then( endpointsJson => {
                    return JSON.parse(endpointsJson)
                })

            // if there are more old routes
            // then rebuild from scratch
            if ( oldRoutesList.length > freshRoutesList.length ) {
                console.log('More old routes than current ones: Building all routes')
                return freshRoutesList
            }
            console.log('oldRoutesList.length', oldRoutesList.length)
            console.log('freshRoutesList.length', freshRoutesList.length)

            // Store old routes into set
            // so we can quickly compare them
            const oldRoutesSet = new Map( oldRoutesList.map( endpoint => [ endpoint.route, endpoint.payload ] ) )

            // Look through fresh routes and store any that are new
            for ( const routeFromFreshList of freshRoutesList ) {
                // If the route in not in old routes
                // then regenerate this route
                if ( !oldRoutesSet.has( routeFromFreshList.route ) || JSON.stringify(oldRoutesSet.get( routeFromFreshList.route )) !== JSON.stringify(routeFromFreshList.payload) ) {
                    console.log( 'Found new route', routeFromFreshList.route )
                    additionalRoutes.push( routeFromFreshList )

                    continue
                }

                const payloadChanged = JSON.stringify(oldRoutesSet.get( routeFromFreshList.route )) !== JSON.stringify(routeFromFreshList.payload)

                // If the route payload changed
                // then regenerate this route
                if ( payloadChanged ) {
                    console.log( 'Route payload changed', routeFromFreshList.route )
                    additionalRoutes.push( routeFromFreshList )

                    continue
                }
            }

            console.log( 'additionalRoutes', additionalRoutes.length )

            return additionalRoutes
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
        title: 'Does it ARM',
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
        link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }]
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
    plugins: [],

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

            console.log('Total Sitemap Endpoints', sitemapEndpoints.length)

            return sitemapEndpoints.map( endpoint => endpoint.route )
        }
    },

    buildModules: [
        '@nuxtjs/tailwindcss'
    ],

    /*
    ** Build configuration
    */
    build: {
        // parallel: true,
        // hardSource: true,
        cache: true,
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

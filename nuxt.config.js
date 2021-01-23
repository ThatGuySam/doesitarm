import { promises as fs } from 'fs'
// import path from 'path'

import pkg from './package'
import buildAppList from './helpers/build-app-list.js'
import buildGamesList from './helpers/build-game-list.js'
import buildHomebrewList from './helpers/build-homebrew-list.js'
import buildVideoList from './helpers/build-video-list.js'

import { buildVideoPayload, buildAppBenchmarkPayload } from './helpers/build-payload.js'

import { categories } from './helpers/categories.js'
import { getAppEndpoint, getVideoEndpoint } from './helpers/app-derived.js'





export default {
    target: 'static',

    publicRuntimeConfig: {
        allUpdateSubscribe: process.env.ALL_UPDATE_SUBSCRIBE
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
        cache: {
            ignore: [
                // When something changed in the docs folder, do not re-build via webpack
                'assets'
            ]
        },
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
        title: 'Does it ARM',
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
        hostname: 'https://doesitarm.com'
    },

    buildModules: [
        '@nuxtjs/tailwindcss'
    ],

    /*
    ** Build configuration
    */
    build: {
        parallel: true,
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

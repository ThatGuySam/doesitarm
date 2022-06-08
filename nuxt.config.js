import { promises as fs } from 'fs'

import pkg from './package.json'
import { getSiteUrl } from '~/helpers/url.js'
import { publicRuntimeConfig } from '~/helpers/public-runtime-config.mjs'



const siteUrl = getSiteUrl()


export default {
    target: 'static',

    publicRuntimeConfig,

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
    head: ,

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

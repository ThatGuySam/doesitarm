import { promises as fs } from 'fs'
import path from 'path'

import pkg from './package'
import buildAppList from './helpers/build-app-list'


const storeAppList = async function (builder) {
    const appListPath = path.join(
        // builder.nuxt.options.buildDir,
        builder.nuxt.options.srcDir,
        '/assets/app-list.json'
    )

    const appList = await buildAppList()

    // console.log('builder.nuxt.options', builder.nuxt.options)
    await fs.writeFile(appListPath, JSON.stringify(appList))
}


export default {
    mode: 'universal',
    target: 'static',

    /*
    ** Hooks
    * https://nuxtjs.org/api/configuration-hooks/
    */
    hooks: {
        build: {
            before: storeAppList
        },
        generate: {
            before: storeAppList
        }
    },

    generate: {
        routes() {
            return import('./assets/app-list.json')//buildAppList()
                .then((importedAppList) => {
                    const appList = importedAppList.default
                    // console.log('appList', appList)

                    const appRoutes = appList.map(app => ({
                        route: '/app/' + app.slug,
                        // payload: appList
                    }))

                    const sectionList = []

                    appList.forEach(app => {
                        if (sectionList.includes(app.section.slug)) return

                        sectionList.push(app.section.slug)
                    })

                    const sectionRoutes = sectionList.map(slug => ({
                        route: '/kind/' + slug,
                        // payload: appList
                    }))

                    return [
                        ...appRoutes,
                        ...sectionRoutes
                    ]
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

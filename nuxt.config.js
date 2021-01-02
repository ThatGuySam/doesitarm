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


const listsOptions = [
    {
        buildMethod: buildAppList,
        path: '/static/app-list.json',
    },
    {
        buildMethod: buildGamesList,
        path: '/static/game-list.json',
    },
    {
        buildMethod: buildHomebrewList,
        path: '/static/homebrew-list.json',
    }
]

const videoListOptions = {
    buildMethod: buildVideoList,
    path: '/static/video-list.json',
}


const saveList = async function ( list, buildArgs = null ) {
    const methodName = `Building ${list.path}`
    console.time(methodName)

    // Run the build method
    const builtList = await list.buildMethod(buildArgs)

    // Make the relative path for our new JSON file
    const listFullPath = `.${list.path}`

    // console.log('listFullPath', listFullPath)

    // Write the list to JSON
    await fs.writeFile(listFullPath, JSON.stringify(builtList))

    // Read back the JSON we just wrote to ensure it exists
    const savedListJSON = await fs.readFile(listFullPath, 'utf-8')

    // console.log('savedListJSON', savedListJSON)

    const savedList = JSON.parse(savedListJSON)


    console.timeEnd(methodName)

    // Import the created JSON File
    return savedList
}


const storeAppLists = async function (builder) {

    console.log('Build Lists started')

    const savedLists = await Promise.all(listsOptions.map(saveList))
        // Build and save list of videos based on app lists
        .then(async lists => {
            const [
                appList,
                gameList
            ] = lists

            // Build a video app list with apps and games only
            const allVideoAppsList = [
                ...appList,
                ...gameList
            ].flat(1)

            return await saveList(videoListOptions, allVideoAppsList)
        })

    console.log('Build Lists finished')

    return savedLists
}


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
        build: {
            before: storeAppLists
        },
        generate: {
            before: storeAppLists
        }
    },

    generate: {
        cache: {
            ignore: [
                // When something changed in the docs folder, do not re-build via webpack
                'assets'
            ]
        },
        routes() {
            return Promise.all([
                ...listsOptions,
                videoListOptions
            ].map(async list => {
                // Read saved lists

                const methodName = `Reading ${list.path}`
                console.time(methodName)

                const listPath = `.${list.path}`

                // Read JSON to ensure it exists
                const savedListJSON = await fs.readFile(listPath, 'utf-8')

                // Parse the saved JSON into a variable
                const savedList = JSON.parse(savedListJSON)

                console.timeEnd(methodName)

                // Pass on the variable
                return savedList
            }))
                .then(( lists ) => {
                    // console.log('appList', appList)

                    // Break out lists
                    const [
                        appList,
                        gameList,
                        _,//homebrewList,

                        videoList
                    ] = lists

                    const allVideoAppsList = [
                        ...appList,
                        ...gameList
                    ]

                    // console.log('allVideoAppsList', allVideoAppsList[0])
                    // console.log('videoList', videoList[0])

                    const [
                        appRoutes,
                        gameRoutes,
                        homebrewRoutes,

                        videoRoutes
                    ] = lists.map((list, listI) => {
                        return list.map( app => {

                            const isVideo = (app.category === undefined)

                            if (isVideo) {
                                return {
                                    route: getVideoEndpoint(app),
                                    payload: buildVideoPayload(app, allVideoAppsList, videoList)
                                }
                            }

                            return {
                                route: getAppEndpoint(app),
                                payload: { app }
                            }
                        })
                    })

                    // Build routes for app types that support benchmark endpoints
                    const benchmarkRoutes = [
                        ...appRoutes,
                        ...gameRoutes,
                    ].flat(1).map( ({ route, payload: { app } }) => ({
                        route: `${route}/benchmarks`,
                        payload: buildAppBenchmarkPayload( app, allVideoAppsList, videoList )
                    }))

                    // console.log('homebrewRoutes', homebrewRoutes)

                    const categoryRoutes = Object.keys(categories).map( slug => ({
                        route: '/kind/' + slug,
                        // payload: appList
                    }))

                    // Merge endpoints into set to ensure no duplicates
                    const allEndpointsSet = new Set([
                        ...appRoutes,
                        ...gameRoutes,
                        ...homebrewRoutes,

                        // Non-app routes
                        ...videoRoutes,
                        ...categoryRoutes,
                        ...benchmarkRoutes
                    ])

                    return Array.from(allEndpointsSet)
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

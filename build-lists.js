import { promises as fs } from 'fs'
import dotenv from 'dotenv'

import buildAppList from './helpers/build-app-list.js'
import buildGamesList from './helpers/build-game-list.js'
import buildHomebrewList from './helpers/build-homebrew-list.js'
import buildVideoList from './helpers/build-video-list.js'

import { buildVideoPayload, buildAppBenchmarkPayload } from './helpers/build-payload.js'

import { categories } from './helpers/categories.js'
import { getAppEndpoint, getVideoEndpoint } from './helpers/app-derived.js'

// Setup dotenv
dotenv.config()


class BuildLists {

    constructor () {
        // this.apps = new Set()
        // this.games = new Set()
        // this.homebrewFormulae = new Set()

        this.lists = {}

        this.nuxtEndpointsSet = new Set()
        this.eleventyEndpointsSet = new Set()

        // Videos contains app and game data
        // so it goes during the second pass
        // this.videos = new Set()
    }

    listsOptions = [
        {
            name: 'apps',
            path: '/static/app-list.json',
            buildMethod: buildAppList,
        },
        {
            name: 'games',
            path: '/static/game-list.json',
            buildMethod: buildGamesList,
        },
        {
            name: 'homebrewFormulae',
            path: '/static/homebrew-list.json',
            buildMethod: buildHomebrewList,
        },

        // Always goes after initial lists
        {
            name: 'videos',
            path: '/static/video-list.json',
            buildMethod: async () => {

                // return await buildVideoList( this.getAllVideoAppsList() )


                const videoList = await buildVideoList( this.getAllVideoAppsList() )

                const extraVideos = []

                const multiplier = 12

                for (let i = 0; i < multiplier; i++) {
                    videoList.forEach( video => {
                        extraVideos.push({
                            ...video,
                            slug: video.slug + '-' + i,
                        })
                    })
                }

                return new Set([
                    ...videoList,
                    ...extraVideos
                ].slice(0, 10 * 1000))
            },
        }
    ]

    getAllVideoAppsList = () => {
        // return new Set([
        //     ...this.lists.apps,
        //     ...this.lists.games,
        // ])

        return [
            ...Array.from(this.lists.apps),
            ...Array.from(this.lists.games),
        ]
    }

    saveToJson = async function ( content, path ) {

        // Write the list to JSON
        await fs.writeFile(path, JSON.stringify(content))

        return
    }

    saveList = async function ( listOptions ) {

        if (this.lists[listOptions.name].size === 0) throw new Error('Trying to save empty list')

        // Make the relative path for our new JSON file
        const listFullPath = `.${listOptions.path}`

        // console.log('listFullPath', listFullPath)

        // Write the list to JSON
        await fs.writeFile(listFullPath, JSON.stringify(Array.from(this.lists[listOptions.name])))

        // Read back the JSON we just wrote to ensure it exists
        const savedListJSON = await fs.readFile(listFullPath, 'utf-8')

        // console.log('savedListJSON', savedListJSON)

        const savedList = JSON.parse(savedListJSON)

        // Import the created JSON File
        return savedList
    }

    async buildLists () {
        console.log('Build Lists started')


        for (const listOptions of this.listsOptions) {

            const methodName = `Building ${listOptions.path}`
            console.time(methodName)

            const builtList = await listOptions.buildMethod()

            // Run the build method to get the lists
            this.lists[listOptions.name] = new Set([
                ...builtList
            ])


            console.timeEnd(methodName)
        }

        console.log('Build Lists finished')

        return
    }

    storeAppLists = async function () {

        if (Object.keys(this.listsOptions).length === 0) throw new Error('Trying to store empty lists')

        for ( const listOptionsKey in this.listsOptions ) {
            await this.saveList(this.listsOptions[listOptionsKey])
        }

        return
    }

    async build () {

        await this.buildLists()

        await this.storeAppLists()

        // console.log('appList', appList)

        // Break out lists
        // const [
        //     appList,
        //     gameList,
        //     _,//homebrewList,

        //     videoList
        // ] = savedLists

        // console.log('appList', appList)

        const allVideoAppsList = this.getAllVideoAppsList()

        // console.log('allVideoAppsList', allVideoAppsList[0])
        // console.log('videoList', videoList[0])

        // const allEndpointsSet = new Set()

        // Add list based routes
        for ( const listKey in this.lists ) {

            this.lists[listKey].forEach( app => {

                const isVideo = (app.category === undefined)
                const isApp = (app.endpoint.includes('/app/'))
                const isGame = (app.category === 'games')

                if (isVideo) {
                    this.eleventyEndpointsSet.add({
                        route: getVideoEndpoint(app),
                        payload: buildVideoPayload( app, allVideoAppsList, this.lists.videos )
                    })

                    return
                }

                // Add benchmark endpoints for apps and games
                if ( isApp || isGame ) {
                    this.nuxtEndpointsSet.add({
                        route: `${getAppEndpoint(app)}/benchmarks`,
                        payload: buildAppBenchmarkPayload( app, allVideoAppsList, this.lists.videos )
                    })
                }

                this.nuxtEndpointsSet.add({
                    route: getAppEndpoint(app),
                    payload: { app }
                })

                return
            })

        }


        Object.keys(categories).forEach( slug => {
            this.nuxtEndpointsSet.add({
                route: '/kind/' + slug,
                // payload: appList
            })
        })


        // Save Nuxt Endpoints
        await this.saveToJson(Array.from(this.nuxtEndpointsSet), './static/nuxt-endpoints.json')

        // Save Eleventy Endpoints
        await this.saveToJson(Array.from(this.eleventyEndpointsSet), './static/eleventy-endpoints.json')

        return
    }
}


const listBuilder = new BuildLists()

listBuilder.build()

// export default async function () {
//     const listBuilder = new BuildLists()

//     return await listBuilder.build()
// }

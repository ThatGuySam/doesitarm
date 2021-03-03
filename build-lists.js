import { promises as fs } from 'fs'
import dotenv from 'dotenv'

import buildAppList from './helpers/build-app-list.js'
import buildGamesList from './helpers/build-game-list.js'
import buildHomebrewList from './helpers/build-homebrew-list.js'
import buildVideoList from './helpers/build-video-list.js'

import { buildVideoPayload, buildAppBenchmarkPayload } from './helpers/build-payload.js'

import { categories, getAppCategory } from './helpers/categories.js'
import { getAppType, getAppEndpoint, getVideoEndpoint } from './helpers/app-derived.js'
import { makeSearchableList } from './helpers/searchable-list.js'

// Setup dotenv
dotenv.config()



class BuildLists {

    constructor () {
        // Where our lists are stored
        this.lists = {}

        this.endpointSets = {
            // Where Nuxt Routes and Payloads get stored
            nuxt: new Set(),

            // Where Eleventy Endpoints get stored
            eleventy: new Set()
        }

        this.allVideoAppsList = new Set()
    }

    listsOptions = [

        // Mixed sources will(theoretically) go here
        // then be read by follow main build methods


        // Main build methods
        {
            name: 'app',
            path: '/static/app-list.json',
            buildMethod: buildAppList,
        },
        {
            name: 'game',
            path: '/static/game-list.json',
            buildMethod: buildGamesList,
        },
        {
            name: 'homebrew',
            path: '/static/homebrew-list.json',
            buildMethod: buildHomebrewList,
        },

        // Secondary Derivative built lists
        // Always goes after initial lists
        // since it depend on them
        {
            name: 'video',
            path: '/static/video-list.json',
            buildMethod: async () => {

                // console.log('this.getAllVideoAppsList()', this.getAllVideoAppsList())

                return await buildVideoList( this.getAllVideoAppsList() )


                // const videoList = await buildVideoList( this.getAllVideoAppsList() )

                // const extraVideos = []

                // const multiplier = 12

                // for (let i = 0; i < multiplier; i++) {
                //     videoList.forEach( video => {
                //         extraVideos.push({
                //             ...video,
                //             slug: video.slug + '-' + i,
                //         })
                //     })
                // }

                // return new Set([
                //     ...videoList,
                //     ...extraVideos
                // ].slice(0, 10 * 1000))
            },
            beforeSave: videoListSet => {
                this.allVideoAppsList = this.getAllVideoAppsList()

                return Array.from(videoListSet).map( video => {
                    return {
                        ...video,
                        payload: buildVideoPayload( video, this.allVideoAppsList, this.lists.video )
                    }
                })
            }
        }
    ]

    getAllVideoAppsList = () => {
        return new Set([
            ...this.lists.app,
            ...this.lists.game,
        ])
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

        const hasSaveMethod = listOptions.hasOwnProperty('beforeSave')
        const saveMethod = hasSaveMethod ? listOptions.beforeSave : listSet => Array.from( listSet )

        // console.log('listFullPath', listFullPath)

        const saveableList = saveMethod( this.lists[listOptions.name] )

        console.log('saveableList', typeof saveableList)

        // Write the list to JSON
        await fs.writeFile(listFullPath, JSON.stringify( saveableList ))

        // Read back the JSON we just wrote to ensure it exists
        const savedListJSON = await fs.readFile(listFullPath, 'utf-8')

        // console.log('savedListJSON', savedListJSON)

        const savedList = JSON.parse(savedListJSON)

        // Import the created JSON File
        return savedList
    }

    // Run all listsOprions methods
    // and store them to this.lists
    async buildLists () {
        console.log('Build Lists started')


        for ( const listOptions of this.listsOptions ) {

            const methodName = `Building ${listOptions.name}`
            console.time(methodName)

            const builtList = await listOptions.buildMethod()

            // Run the build method to get the lists
            this.lists[listOptions.name] = new Set( builtList )

            console.timeEnd(methodName)
            console.log(`Finished ${listOptions.name} list with ${this.lists[listOptions.name].size} items`)
        }

        console.log('Build Lists finished')

        return
    }

    // Save app lists to JSON
    saveAppLists = async function () {

        if (Object.keys(this.listsOptions).length === 0) throw new Error('Trying to store empty lists')

        console.log('Save lists started')

        for ( const listOptionsKey in this.listsOptions ) {

            const methodName = `Saving ${this.listsOptions[listOptionsKey].path}`
            console.time(methodName)

            const listOptions = this.listsOptions[listOptionsKey]

            await this.saveList( listOptions )

            const searchableList = makeSearchableList( this.lists[listOptions.name] )

            // console.log('searchableList', searchableList)

            // Save a searchable list
            await this.saveToJson( Array.from(searchableList), `./static/${listOptions.name}-list-searchable.json` )


            console.timeEnd(methodName)
        }

        console.log('Save lists finished')

        return
    }

    async build () {

        await this.buildLists()

        await this.saveAppLists()

        // console.log('appList', appList)

        // console.log('this.allVideoAppsList', this.allVideoAppsList.length, this.allVideoAppsList[0])

        // Add list based routes
        for ( const listKey in this.lists ) {

            this.lists[listKey].forEach( app => {

                const isVideo = (app.category === undefined)
                const appType = getAppType( app )

                if ( isVideo ) {
                    // this.endpointSets.eleventy.add({
                    //     route: getVideoEndpoint(app),
                    //     // payload: buildVideoPayload( app, this.allVideoAppsList, this.lists.video )
                    // })

                    this.endpointSets.nuxt.add({
                        route: getVideoEndpoint(app),
                        payload: buildVideoPayload( app, this.allVideoAppsList, this.lists.video )
                    })

                    return
                }

                // if ( isGame ) { console.log() }

                // Add benchmark endpoints for apps and games
                if ( appType === 'app' || appType === 'game' ) {
                    this.endpointSets.nuxt.add({
                        route: `${getAppEndpoint(app)}/benchmarks`,
                        payload: buildAppBenchmarkPayload( app, this.allVideoAppsList, this.lists.video )
                    })
                }

                // Add app or game endpoint
                this.endpointSets.nuxt.add({
                    route: getAppEndpoint(app),
                    payload: { app }
                })
                // console.log('Added to nuxt endpoints', getAppEndpoint(app))

                return
            })

        }


        Object.keys(categories).forEach( slug => {
            this.endpointSets.nuxt.add({
                route: '/kind/' + slug,
                // payload: appList
            })
        })


        // Save Nuxt Endpoints
        // await this.saveToJson(Array.from(this.endpointSets.nuxt), './static/nuxt-endpoints.json')

        // // Save Eleventy Endpoints
        // await this.saveToJson(Array.from(this.endpointSets.eleventy), './static/eleventy-endpoints.json')

        for ( const [ endpointSetName, endpointSet ] of Object.entries(this.endpointSets) ) {
            // Save Endpoints
            await this.saveToJson(Array.from( endpointSet ), `./static/${endpointSetName}-endpoints.json`)
        }

        // Save sitemap endpoints
        await this.saveToJson(Object.values(this.endpointSets).map( endpointSet => {
            return Array.from( endpointSet )
        } ).flat(1), './static/sitemap-endpoints.json')

        return
    }
}


const listBuilder = new BuildLists()

listBuilder.build()

// export default async function () {
//     const listBuilder = new BuildLists()

//     return await listBuilder.build()
// }

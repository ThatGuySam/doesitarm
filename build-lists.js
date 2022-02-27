import { dirname } from 'path'

import fs from 'fs-extra'
import dotenv from 'dotenv'
import { PromisePool } from '@supercharge/promise-pool'

import buildAppList from './helpers/build-app-list.js'
import buildGamesList from './helpers/build-game-list.js'
import buildHomebrewList from './helpers/build-homebrew-list.js'
import buildVideoList from './helpers/build-video-list.js'
import buildDeviceList from './helpers/build-device-list.js'

import { videosRelatedToApp } from './helpers/related.js'
import { buildVideoPayload, buildAppBenchmarkPayload } from './helpers/build-payload.js'

import { categories, getAppCategory } from './helpers/categories.js'
import {
    getAppType,
    getAppEndpoint,
    getVideoEndpoint,
    isVideo
} from './helpers/app-derived.js'
import { makeSearchableList } from './helpers/searchable-list.js'

// Setup dotenv
dotenv.config()

const commandArguments = process.argv
const withApi = commandArguments.includes('--with-api')



class BuildLists {

    constructor () {
        // Where our lists are stored
        this.lists = {}

        this.endpointMaps = {
            // Where Nuxt Routes and Payloads get stored
            nuxt: new Map(),

            // Where Eleventy Endpoints get stored
            eleventy: new Map()
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
        {
            name: 'device',
            path: '/static/device-list.json',
            buildMethod: buildDeviceList,
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

    saveApiEndpoints = async function ( listOptions ) {

        await PromisePool
            .withConcurrency(100)
            .for( Array.from( this.lists[listOptions.name] ) )
            .process(async ( listEntry, index, pool ) => {
                // console.log('listEntry', listEntry)

                const {
                    // name,
                    // aliases,
                    // status,
                    // bundleIds,
                    endpoint,

                } = listEntry

                const endpointPath = `./static/api${endpoint}.json`
                const endpointDirectory = dirname(endpointPath)

                // Stop if the endpoint is already exists
                if (fs.existsSync(endpointPath)) {
                    console.log(`Path "${endpointPath}" already exists`)

                    return
                }

                // console.log(`Saving endpoint "${endpoint}" to "${endpointPath}"`)

                // Ensure the directory exists
                await fs.ensureDir( endpointDirectory )

                // Write the endpoint to JSON
                await this.saveToJson( listEntry, endpointPath )
            })


        // Save each enpoint's data
        // for ( const listEntry of this.lists[listOptions.name] ) {


        // }
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

            if ( withApi ) {
                console.log('Saving individual endpoints...')

                const endpointMethodName = `Saved /${ listOptions.name } endpoints`
                console.time(endpointMethodName)

                await this.saveApiEndpoints( listOptions )

                console.timeEnd(endpointMethodName)
            }
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

                // const isVideo = (app.category === undefined)
                const appType = getAppType( app )

                if ( isVideo( app ) ) {
                    this.endpointMaps.eleventy.set(
                        getVideoEndpoint(app),
                        buildVideoPayload( app, this.allVideoAppsList, this.lists.video )
                    )

                    // this.endpointMaps.nuxt.set( getVideoEndpoint(app), buildVideoPayload( app, this.allVideoAppsList, this.lists.video ) )

                    return
                }

                // if ( isGame ) { console.log() }

                // Add benchmark endpoints for apps and games
                if ( appType === 'app' || appType === 'game' ) {
                    const payload = buildAppBenchmarkPayload( app, this.allVideoAppsList, this.lists.video )

                    // Only add a benchmarks endpoint if it has any videos
                    if ( payload.allVideos.length > 0 ) {
                        // this.endpointMaps.nuxt.add({
                        //     route: `${getAppEndpoint(app)}/benchmarks`,
                        //     payload: buildAppBenchmarkPayload( app, this.allVideoAppsList, this.lists.video )
                        // })

                        this.endpointMaps.nuxt.set( `${getAppEndpoint(app)}/benchmarks`, buildAppBenchmarkPayload( app, this.allVideoAppsList, this.lists.video ) )
                    }
                }

                // Add standard app endpoint
                if ( appType === 'app' || appType === 'formula' ) {

                    const relatedVideos = videosRelatedToApp( app, this.lists.video ).map(video => {
                        // console.log('video', video)
                        return {
                            ...video,
                            endpoint: `${getAppEndpoint(app)}/benchmarks#${video.id}`
                        }
                    })

                    // Add app or formula endpoint
                    this.endpointMaps.eleventy.set( getAppEndpoint(app), {
                        app,
                        relatedVideos
                    } )

                } else if ( appType === 'device' ) {
                    // Add device endpoint
                    // console.log('Added to nuxt endpoints', app.endpoint )
                    this.endpointMaps.nuxt.set( app.endpoint , { listing: app } )

                } else {
                    // Add game or other endpoint
                    // console.log('Added to nuxt endpoints', app.endpoint )
                    this.endpointMaps.nuxt.set( getAppEndpoint(app), { app } )
                }

                return
            })

        }


        // Create endpoints for categories
        Object.keys(categories).forEach( slug => {
            // this.endpointMaps.nuxt.add({
            //     route: '/kind/' + slug,
            //     // payload: appList
            // })
            this.endpointMaps.nuxt.set( '/kind/' + slug, {} )
        })


        // Save Nuxt Endpoints
        // await this.saveToJson(Array.from(this.endpointMaps.nuxt), './static/nuxt-endpoints.json')

        // // Save Eleventy Endpoints
        // await this.saveToJson(Array.from(this.endpointMaps.eleventy), './static/eleventy-endpoints.json')

        // console.log('this.endpointMaps.eleventy /app/chrome', this.endpointMaps.eleventy.get( '/app/chrome' ))


        // Filter eleventy endpoints
        // this.endpointMaps.eleventy = new Set([
        //     ['/app/chrome', this.endpointMaps.eleventy.get( '/app/chrome' )]
        // ])

        for ( const [ endpointSetName, endpointSet ] of Object.entries(this.endpointMaps) ) {
            // Save Endpoints
            await this.saveToJson(Array.from( endpointSet , ([route, payload]) => ({ route, payload })), `./static/${endpointSetName}-endpoints.json`)
        }

        // Save sitemap endpoints
        await this.saveToJson(Object.values(this.endpointMaps).map( endpointSet => {
            return Array.from( endpointSet , ([route, payload]) => ({ route, payload }) )
        } ).flat(1), './static/sitemap-endpoints.json')

        console.log('Total Nuxt Endpoints', this.endpointMaps.nuxt.size )
        console.log('Total Eleventy Endpoints', this.endpointMaps.eleventy.size )
        console.log('Total Endpoints', this.endpointMaps.nuxt.size + this.endpointMaps.eleventy.size )

        return
    }
}


const listBuilder = new BuildLists()

listBuilder.build()

// export default async function () {
//     const listBuilder = new BuildLists()

//     return await listBuilder.build()
// }

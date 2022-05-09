import { dirname } from 'path'

import fs from 'fs-extra'
import dotenv from 'dotenv'
import semver from 'semver'
import { PromisePool } from '@supercharge/promise-pool'
import mapValues from 'just-map-values'

import buildAppList from './helpers/build-app-list.js'
import buildGamesList from './helpers/build-game-list.js'
import buildHomebrewList from './helpers/build-homebrew-list.js'
import buildVideoList from './helpers/build-video-list.js'
import buildDeviceList from './helpers/build-device-list.js'
import { deviceSupportsApp } from './helpers/devices.js'

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

import {
    writeStorkToml
} from './helpers/stork/toml.js'

// Setup dotenv
dotenv.config()

const commandArguments = process.argv
const cliOptions = {
    withApi: commandArguments.includes('--with-api'),
    noLists: commandArguments.includes('--no-lists'),
}


function normalizeVersion ( rawVersion ) {
    const containsNumbers = /\d+/.test( rawVersion )

    if ( !containsNumbers ) {
        return '0.0.0'
    }

    let version = rawVersion

    // Parse each part
    version = version
        .split('.')
        .map( part => {
            // Trim leading zeros
            return part.replace(/^0+/, '')
        } )
        .join('.')

    return semver.coerce(version)
}
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
            endpointPrefix: 'app',
            path: '/static/app-list.json',
            buildMethod: buildAppList,
        },
        {
            name: 'game',
            endpointPrefix: 'game',
            path: '/static/game-list.json',
            buildMethod: buildGamesList,
        },
        {
            name: 'homebrew',
            endpointPrefix: 'formula',
            path: '/static/homebrew-list.json',
            buildMethod: buildHomebrewList,
        },
        {
            name: 'device',
            endpointPrefix: 'device',
            path: '/static/device-list.json',
            buildMethod: buildDeviceList,
        },

        // Secondary Derivative built lists
        // Always goes after initial lists
        // since it depend on them
        {
            name: 'video',
            endpointPrefix: 'tv',
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

    shouldHaveRelatedVideos ( app ) {
        const appType = getAppType( app )

        return appType === 'app' || appType === 'formula'
    }

    shouldHaveDeviceSupport ( app ) {
        const appType = getAppType( app )

        return appType === 'app' || appType === 'formula' || appType === 'game'
    }

    getAllVideoAppsList = () => {
        return new Set([
            ...this.lists.app,
            ...this.lists.game,
        ])
    }

    bundles = []
    async getSavedAppBundles ( options = {} ) {
        const {
            keepBundlesInMemory = true
        } = options

        if ( !keepBundlesInMemory ) {
            // console.log('Getting bundles from file')
            return await fs.readJson('./static/app-bundles.json')
        }

        // From here we get and store bundles


        // Check if any bundles are already in memory
        if ( this.bundles.length === 0 ) {
            // console.log('Storing bundles to memory')
            this.bundles = await fs.readJson('./static/app-bundles.json')
        }

        // console.log('Getting bundles from memory')
        return this.bundles
    }

    // Load the bundles from files
    // so that we don't have to keep them in memory
    async findAppBundle ( needleBundleIdentifier ) {
        const bundles = await this.getSavedAppBundles()

        return bundles.find( ([
            storedAppBundleIdentifier,
            // versions
        ]) => storedAppBundleIdentifier === needleBundleIdentifier )
    }

    async getAppBundles ( app ) {
        return await Promise.all( app.bundleIds.map( async bundleIdentifier => {
            return await this.findAppBundle( bundleIdentifier )
        } ) )
    }

    sortBundleVersions ( bundles ) {
        return bundles.map( bundle => {
            const [
                bundleIdentifier,
                versionsObject
            ] = bundle

            // Sort versions by semver
            const versions = Object.entries( versionsObject ).sort( ( [ aVersionRaw ], [ bVersionRaw ] ) => {
                const aVersion = normalizeVersion( aVersionRaw )
                const bVersion = normalizeVersion( bVersionRaw )

                return semver.compare( bVersion, aVersion )
            } )

            return [
                bundleIdentifier,
                versions
            ]
        } )
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

        // console.log('saveableList', typeof saveableList)

        // Stringify one at a time to allow for large lists
        const saveableListJSON = '[' + saveableList.map(el => JSON.stringify(el)).join(',') + ']'

        // Write the list to JSON
        await fs.writeFile(listFullPath, saveableListJSON)

        return
    }

    // Run all listsOprions methods
    // and store them to this.lists
    async buildLists () {
        console.log( 'Build Lists started', cliOptions )


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

    saveApiEndpoints = async ( listOptions ) => {

        const apiDirectory = './static/api'
        const apiListDirectory = `${ apiDirectory }/${ listOptions.endpointPrefix }`

        const poolSize = 1000

        // Store app bundles to memory
        await this.getSavedAppBundles({
            keepBundlesInMemory: true
        })

        const { errors } = await PromisePool
            .withConcurrency( poolSize )
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

                const endpointPath = `${ apiDirectory }${ endpoint }.json`
                const endpointDirectory = dirname(endpointPath)

                // Add related videos
                if ( this.shouldHaveRelatedVideos( listEntry ) ) {
                    listEntry.relatedVideos = videosRelatedToApp( listEntry, this.lists.video ).map(video => {
                        // console.log('video', video)
                        return {
                            ...video,
                            endpoint: `${getAppEndpoint(listEntry)}/benchmarks#${video.id}`
                        }
                    })
                }

                // Add App Bundles
                if ( Array.isArray( listEntry.bundleIds ) ) {
                    listEntry.bundles = await this.getAppBundles( listEntry )

                    listEntry.bundles = this.sortBundleVersions( listEntry.bundles )
                }


                // Add device support
                if ( this.shouldHaveDeviceSupport( listEntry ) ) {
                    const deviceList = Array.from( this.lists[ 'device' ] )

                    listEntry.deviceSupport = deviceList.map( device => {
                        const supportsApp = deviceSupportsApp( device, listEntry )
                        return {
                            ...device,
                            emoji: supportsApp ? '✅' : '🚫',
                            ariaLabel: `${ listEntry.name } has ${ supportsApp ? '' : 'not' } been reported to work on ${ device.name }`
                        }
                    })
                }

                // console.log(`Saving endpoint "${endpoint}" to "${endpointPath}"`)

                // Ensure the directory exists
                await fs.ensureDir( endpointDirectory )

                // Write the endpoint to JSON
                await this.saveToJson( listEntry, endpointPath )
            })

        if ( errors.length !== 0 ) {
            throw new Error( errors )
        }

        // Count saved files
        const fileCount = fs.readdirSync( apiListDirectory ).length

        console.log( fileCount, 'Files saved in', apiListDirectory )
        console.log( this.lists[listOptions.name].size, 'Entries' )

        if ( fileCount !== this.lists[listOptions.name].size ) {
            throw new Error( `Files don\'t match list count in ${ apiListDirectory }` )
        }
    }

    // Save app lists to JSON
    saveAppLists = async function () {

        if (Object.keys(this.listsOptions).length === 0) throw new Error('Trying to store empty lists')

        console.log('Save lists started')

        for ( const listOptionsKey in this.listsOptions ) {

            const methodName = `Saving ${this.listsOptions[listOptionsKey].path}`
            console.time(methodName)

            const listOptions = this.listsOptions[listOptionsKey]

            if ( !cliOptions.noLists ) {
                await this.saveList( listOptions )
            }

            const searchableList = makeSearchableList( this.lists[listOptions.name] )

            // console.log('searchableList', searchableList)

            // Save a searchable list
            await this.saveToJson( Array.from(searchableList), `./static/${listOptions.name}-list-searchable.json` )

            console.timeEnd(methodName)

            if ( cliOptions.withApi ) {
                console.log('\n', `-- Starting individual /${ listOptions.name } endpoints`)

                const endpointMethodName = `Finished individual /${ listOptions.name } endpoints`
                console.time(endpointMethodName)

                await this.saveApiEndpoints( listOptions )

                console.timeEnd(endpointMethodName)
                console.log( '\n\n' )
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
                if ( this.shouldHaveRelatedVideos( app ) ) {

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

        const sitemapEndpoints = Object.values(this.endpointMaps).map( endpointSet => {
            return Array.from( endpointSet , ([route, payload]) => ({ route, payload }) )
        } ).flat(1)

        // Save sitemap endpoints
        await this.saveToJson( sitemapEndpoints, './static/sitemap-endpoints.json')

        // Save stork toml index
        await writeStorkToml( sitemapEndpoints )

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

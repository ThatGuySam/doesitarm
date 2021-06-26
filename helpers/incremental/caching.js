import path from 'path'

import { default as TOML } from '@iarna/toml'
// https://github.com/jprichardson/node-fs-extra
import fs from 'fs-extra'

import { isNetlify, rootDir } from '../environment.js'



// https://github.com/hanbyul-here/nuxt-incremental-build-exp/blob/cb3ef6b001b283de77efee64733db273d991129b/cache-me.js
// export const CACHE_PATH = isNetlify
//     ? path.join('/', 'opt', 'build', 'cache', 'app_build') // Netlify cache path
//     : path.join(rootDir, '.app_build_cache')//path.resolve(__dirname, '.app_build_cache')


export const CACHE_PATH = path.join('_cache')


export async function getNetlifyConfig () {
    const netlifyTomlContents = await fs.readFile('./netlify.toml', 'utf-8')

    // console.log('netlifyTomlContent', netlifyTomlContents)

    return TOML.parse( netlifyTomlContents )
}

export async function readFromJSON ( path ) {
    // Read back the JSON we just wrote to ensure it exists
    const savedJSON = await fs.readFile( path , 'utf-8' )

    // console.log('savedListJSON', savedListJSON)

    return JSON.parse( savedJSON )
}


export class IncrementalCache {

    constructor( options = {} ) {
        this.cachePath = options.cachePath || path.join( CACHE_PATH, 'prod_publish' )
        this.publishDirectoryName = options.publishDirectoryName || null
        this.publishDirectoryPath = options.publishDirectoryPath || null

    }

    // export async function

    async hasCachedPublishFolder () {
        const homePageFile = `${ this.cachePath }/index.html`

        // https://github.com/jprichardson/node-fs-extra/blob/master/docs/pathExists.md
        return await fs.pathExists( homePageFile )
    }

    async hasPublishFolder () {
        const homePageFile = `${ this.publishDirectoryPath }/index.html`

        // https://github.com/jprichardson/node-fs-extra/blob/master/docs/pathExists.md
        return await fs.pathExists( homePageFile )
    }

    async getPublishDirectoryName () {
        const netlifyConfig = await getNetlifyConfig()

        return netlifyConfig.build.publish
    }

    async getPublishDirectoryPath () {
        return path.resolve( rootDir, this.publishDirectoryName )
    }

    async cachePublishFolder () {

        // const publishDirectoryPath = await this.getPublishDirectoryPath()

        // console.log('publishDirectoryPath', publishDirectoryPath)

        // Make sure cache folder exists
        await fs.ensureDir( this.cachePath )

        await fs.copy( this.publishDirectoryPath, this.cachePath )

    }

    async emptyPublishDirectory () {
        return await fs.emptyDir( this.publishDirectoryPath, 'utf-8' )
    }

    async restoreCachedEndpoints ( options = {} ) {

        const {
            endpoints,
            shouldOverwrite = false
        } = options

        if ( !shouldOverwrite && (await this.hasPublishFolder()) === true ) {
            throw new Error('Publish folder already exists!')
        }

        // Copy concurrently for speed
        await Promise.all( endpoints.map( endpoint => {
            const cachedPagePath = path.join( this.cachePath, endpoint.route )
            const publishPagePath = path.join( this.publishDirectoryPath, endpoint.route )

            return fs.copy( cachedPagePath, publishPagePath )
        }))
    }

    async restoreCachedNuxtFiles ( options = {} ) {

        const cachedNuxtAssetsPath = path.resolve( this.cachePath, '_nuxt')
        const publishNuxtAssetsPath = path.resolve( this.publishDirectoryPath, '_nuxt')

        await fs.copy( cachedNuxtAssetsPath, publishNuxtAssetsPath )

        const nuxtEndpointsPath = path.resolve( rootDir, 'static/nuxt-endpoints.json')
        const nuxtEndpoints = await readFromJSON( nuxtEndpointsPath )

        await this.restoreCachedEndpoints({
            endpoints: nuxtEndpoints,
            ...options
        })
    }

    async syncInCachedPublishFolder () {

        if ( (await this.hasPublishFolder()) !== true ) {
            throw new Error('Publish folder not found')
        }

        // const publishDirectoryPath = await this.getPublishDirectoryPath()

        // console.log('publishDirectoryPath', publishDirectoryPath)

        // Make sure cache folder exists
        // await fs.ensureDir( this.cachePath )

        // await fs.copy( this.publishDirectoryPath, this.cachePath )

    }

    async findMissingEndpoints () {
        const sitemapEndpointsPath = path.resolve( rootDir, 'static/sitemap-endpoints.json')
        const sitemapEndpoints = await readFromJSON( sitemapEndpointsPath )

        const missingEndpoints = []

        for ( const endpoint of sitemapEndpoints ) {
            const publishPageFile = `${ this.publishDirectoryPath }/index.html`
            const exists = await fs.pathExists( publishPageFile )

            if (!exists) missingEndpoints.push( endpoint )
        }

        return missingEndpoints
    }

    async init () {

        if ( this.publishDirectoryName === null ) {
            this.publishDirectoryName = await this.getPublishDirectoryName()
        }

        if ( this.publishDirectoryPath === null ) {
            this.publishDirectoryPath = await this.getPublishDirectoryPath()
        }

    }
}

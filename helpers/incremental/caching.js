import path from 'path'

import { default as TOML } from '@iarna/toml'
// https://github.com/jprichardson/node-fs-extra
import fs from 'fs-extra'
import Rsync from 'rsync'

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
            const cachedPagePath = path.join( this.cachePath, endpoint.route, '/index.html' )
            const publishPagePath = path.join( this.publishDirectoryPath, endpoint.route, '/index.html' )

            return fs.copy( cachedPagePath, publishPagePath )
        }))
    }

    async restoreCachedNuxtFiles ( options = {} ) {

        const nonEndpointPaths = [
            '_nuxt',
            'index.html',
            'sitemap-endpoints.json',
            'nuxt-endpoints.json'
        ]

        for ( const assetPath of nonEndpointPaths ) {
            const cachedNuxtAssetsPath = path.resolve( this.cachePath, assetPath)
            const publishNuxtAssetsPath = path.resolve( this.publishDirectoryPath, assetPath)

            await fs.copy( cachedNuxtAssetsPath, publishNuxtAssetsPath )
        }

        // await fs.copy( cachedNuxtAssetsPath, publishNuxtAssetsPath )

        // await fs.copy( this.cachePath + '/index.html', this.publishDirectoryPath + '/index.html' )
        // await fs.copy( this.cachePath + '/static', this.publishDirectoryPath + '/index.html' )

        const nuxtEndpointsPath = path.resolve( this.publishDirectoryPath, 'nuxt-endpoints.json')
        const nuxtEndpoints = await readFromJSON( nuxtEndpointsPath )

        await this.restoreCachedEndpoints({
            endpoints: nuxtEndpoints,
            shouldOverwrite: true,
            ...options
        })
    }

    // Original concept: https://github.com/hanbyul-here/nuxt-incremental-build-exp/blob/master/cache-me.js
    rsyncCacheToPublish = () => new Promise( ( resolve, reject ) => {
        const rsync = new Rsync()
            .shell('ssh')
            .flags('azq')
            .source(this.cachePath + '/')
            .destination(this.publishDirectoryPath)

        try {
            // await fs.ensureDir(CACHE_PATH)
            rsync.execute(async function(error, code, cmd) {
                if (!error) {
                    // await fs.copy(CACHE_PATH, BUILD_PATH)
                    // await cacheFinalFiles()
                    console.log('Rsync finished')

                    resolve()
                } else console.error('error')
            })
        } catch (err) {
            // handle error
            console.warn('Rsync error', err)
            reject(err)
        }
    })

    async syncInCachedPublishFolder () {

        if ( (await this.hasPublishFolder()) !== true ) {
            throw new Error('Publish folder not found')
        }

        await this.rsyncCacheToPublish()

        // const publishDirectoryPath = await this.getPublishDirectoryPath()

        // console.log('publishDirectoryPath', publishDirectoryPath)

        // Make sure cache folder exists
        // await fs.ensureDir( this.cachePath )

        // await fs.copy( this.publishDirectoryPath, this.cachePath )

    }

    async getPublishSitemapEndpoints () {
        const sitemapEndpointsPath = path.resolve( this.publishDirectoryPath, 'sitemap-endpoints.json')
        const sitemapEndpoints = await readFromJSON( sitemapEndpointsPath )

        return sitemapEndpoints
    }

    async findMissingEndpoints ( options = {} ) {
        const {
            endpoints
        } = options

        const missingEndpoints = []

        for ( const endpoint of endpoints ) {
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

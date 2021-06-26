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


export class IncrementalCache {

    constructor( options = {} ) {
        this.cachePath = options.cachePath || CACHE_PATH
        this.publishDirectoryName = options.publishDirectoryName || null
        this.publishDirectoryPath = options.publishDirectoryPath || null

    }

    // export async function

    async hasCachedPublishFolder () {
        const homePageFile = `${ this.cachePath }/index.html`

        // https://github.com/jprichardson/node-fs-extra/blob/master/docs/pathExists.md
        return await fs.pathExists( homePageFile )
    }

    async getPublishDirectoryName () {
        const netlifyConfig = await getNetlifyConfig()

        return netlifyConfig.build.publish
    }

    async getPublishDirectoryPath () {
        // const publishDirectoryPath = await this.getPublishDirectoryName()

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
        // const publishDirectoryPath = await this.getPublishDirectoryName()

        return await fs.emptyDir( this.publishDirectoryPath, 'utf-8' )
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

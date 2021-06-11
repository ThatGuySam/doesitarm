import path from 'path'

import { default as TOML } from '@iarna/toml'
// https://github.com/jprichardson/node-fs-extra
import fs from 'fs-extra'

import { isProduction, rootDir } from '../environment.js'



// https://github.com/hanbyul-here/nuxt-incremental-build-exp/blob/cb3ef6b001b283de77efee64733db273d991129b/cache-me.js
export const CACHE_PATH = isProduction
    ? path.join('/', 'opt', 'build', 'cache', 'app_build') // Netlify cache path
    : path.join(rootDir, '.app_build_cache')//path.resolve(__dirname, '.app_build_cache')


export async function getNetlifyConfig () {
    const netlifyTomlContents = await fs.readFile('./netlify.toml', 'utf-8')

    // console.log('netlifyTomlContent', netlifyTomlContents)

    return TOML.parse( netlifyTomlContents )
}


export async function getPublishDirectoryName () {
    const netlifyConfig = await getNetlifyConfig()

    return netlifyConfig.build.publish
}


export async function getPublishDirectoryPath () {
    const publishDirectoryPath = await getPublishDirectoryName()

    return path.resolve( rootDir, publishDirectoryPath )
}


export async function hasCachedPublishFolder () {
    const homePageFile = `${ CACHE_PATH }/index.html`

    // https://github.com/jprichardson/node-fs-extra/blob/master/docs/pathExists.md
    return await fs.pathExists( homePageFile )
}


export async function cachePublishFolder () {

    const publishDirectoryPath = await getPublishDirectoryPath()

    console.log('publishDirectoryPath', publishDirectoryPath)

    // Make sure cache folder exists
    await fs.ensureDir( CACHE_PATH )

    await fs.copy( publishDirectoryPath, CACHE_PATH )

}

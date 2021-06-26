import path from 'path'

import test from 'ava'

import { isObject, isString } from '../type-checks.js'
import { rootDir } from '../environment.js'
import {
    getNetlifyConfig,
    readFromJSON,
    // CACHE_PATH,

    IncrementalCache
} from './caching.js'


// Keeps tests from messing up production publish folder and files
const testingCachePath = path.join( 'temp', '_test_cache' )
const testingPublishPath = path.join( 'temp', '_test_publish' )


test.before(async t => {

    // Clone publish
    // testingPublishPath

    t.context.cache = new IncrementalCache({
        cachePath: testingCachePath,
        publishDirectoryPath: testingPublishPath
    })

    // Let cache pull in environment context
    await t.context.cache.init()

})


test.serial('Can read netlify.toml', async (t) => {
    t.plan(2)

    const netlifyConfig = await getNetlifyConfig()

    // t.log('netlifyConfig', netlifyConfig)

    t.is( isObject( netlifyConfig ) , true )
    t.is( isString( netlifyConfig.build.publish ) , true )
})


test.serial('Can cache publish folder', async (t) => {

    // Special caching instance that pulls from live publish directory
    // but stores to testing cache directory
    // so that we can copy the live data into an empty testing directory
    // and not the live directory.
    // This means we won't wipe out the build we just did with cached data
    const cache = new IncrementalCache({
        cachePath: testingCachePath
    })

    // Let cache pull in environment context
    await cache.init()


    // So that we don't overwrite the cached files
    // we check if a cached file already exists

    if ( await cache.hasCachedPublishFolder() ) {
        t.log(`Found cached publish folder at ${ testingCachePath }`)
        t.pass()

        return
    }

    t.log('No prexisting cache folder found')


    // If there's no files there already
    // then we can write to the directory with
    await cache.cachePublishFolder()



    if ( (await cache.hasCachedPublishFolder()) === false ) {
        t.fail()
        return
    }

    t.log(`Cached publish folder at ${ testingCachePath }`)
    t.pass()
})


test.serial('Can restore publish folder from cache', async (t) => {

    const {
        cache
    } = t.context

    // Set up nuxt endpoints
    // so that the publish directory looks like it
    // would during a build
    await cache.restoreCachedNuxtFiles()


    // Sync remain cached files into publish folder
    // so Eleventy only has to build updated endpoints
    await cache.syncInCachedPublishFolder()

    // List missing endpoints
    // so we can compare for this test
    const sitemapEndpoints = await cache.getPublishSitemapEndpoints()
    const missingEndpoints = await cache.findMissingEndpoints({
        endpoints: sitemapEndpoints
    })


    // t.log(`Cached publish folder at ${ testingCachePath }`)
    t.is( missingEndpoints.length, 0 )
})

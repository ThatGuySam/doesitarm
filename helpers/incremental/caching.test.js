import path from 'path'

import test from 'ava'

import { isObject, isString } from '../type-checks.js'
import {
    getNetlifyConfig,
    CACHE_PATH,

    IncrementalCache
} from './caching.js'


// Keeps tests from messing up production publish folder and files
const testingCachePath = path.join( CACHE_PATH, 'test' )


test.before(async t => {

    t.context.cache = new IncrementalCache({
        cachePath: testingCachePath
    })

    // Set up cache
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

    const {
        cache
    } = t.context

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

    if ( (await cache.hasCachedPublishFolder( testingCachePath )) === false ) {
        t.log(`Could not find publish folder at ${ testingCachePath }`)
        t.fail()
        return
    }

    // await cache.emptyPublishDirectory()


    // t.log('No prexisting cache folder found')


    // // If there's no files there already
    // // then we can write to the directory with
    await cache.cachePublishFolder()





    // t.log(`Cached publish folder at ${ testingCachePath }`)
    t.pass()
})

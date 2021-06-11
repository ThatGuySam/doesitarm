import test from 'ava'

import { isObject, isString } from '../type-checks.js'
import {
    getNetlifyConfig,
    hasCachedPublishFolder,
    cachePublishFolder,
    CACHE_PATH
} from './caching.js'


test('Can read netlify.toml', async (t) => {
    t.plan(2)

    const netlifyConfig = await getNetlifyConfig()

    // t.log('netlifyConfig', netlifyConfig)

    t.is( isObject( netlifyConfig ) , true )
    t.is( isString( netlifyConfig.build.publish ) , true )
})


test('Can cache publish folder', async (t) => {
    // So that we don't overwrite the cached files
    // we check if a cached file already exists

    if ( await hasCachedPublishFolder() ) {
        t.log(`Found cached publish folder at ${ CACHE_PATH }`)
        t.pass()

        return
    }

    t.log('No prexisting cache folder found')


    // If there's no files there already
    // then we can write to the directory with
    await cachePublishFolder()



    if ( (await hasCachedPublishFolder()) === false ) {
        t.fail()
        return
    }

    t.log(`Cached publish folder at ${ CACHE_PATH }`)
    t.pass()
})

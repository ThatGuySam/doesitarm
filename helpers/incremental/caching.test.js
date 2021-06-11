import test from 'ava'

import { isObject, isString } from '../type-checks.js'
import {
    getNetlifyConfig,
    hasCachedPublishFolder,
    cachePublishFolder
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
        t.log('Publish folder has been cached already')
        t.pass()
    }

    t.log('No prexisting cache folder found')


    // If there's no files there already
    // then we can write to the directory with
    await cachePublishFolder()



    if ( (await hasCachedPublishFolder()) === false ) {
        t.fail()
        return
    }

    t.log('Publish folder has been cached already')
    t.pass()
})

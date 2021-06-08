import test from 'ava'

import { isObject, isString } from '../type-checks.js'
import { getNetlifyConfig } from './caching.js'


test('Can read netlify.toml', async (t) => {
    t.plan(2)

    const netlifyConfig = await getNetlifyConfig()

    // t.log('netlifyConfig', netlifyConfig)

    t.is( isObject( netlifyConfig ) , true )
    t.is( isString( netlifyConfig.build.publish ) , true )
})

// test('Can cache publish folder', async (t) => {



// })

import dotenv from 'dotenv'
import { createRequire } from 'node:module'

dotenv.config()

const require = createRequire( import.meta.url )
const packageJson = require( '../package.json' )
const packageVerbiage = packageJson.config?.verbiage || {}

function getRuntimeValue ( envValue, fallbackValue = null ) {
    if ( typeof envValue === 'string' && envValue.length > 0 ) {
        return envValue
    }

    return fallbackValue
}

export const publicRuntimeConfig = {
    allUpdateSubscribe: process.env.ALL_UPDATE_SUBSCRIBE,
    testResultStore: process.env.TEST_RESULT_STORE,
    siteUrl: process.env.URL,
    macsVerbiage: getRuntimeValue( process.env.npm_package_config_verbiage_macs, packageVerbiage.macs || null ),
    processorsVerbiage: getRuntimeValue( process.env.npm_package_config_verbiage_processors, packageVerbiage.processors || null ),
}

export function makeViteDefinitions () {
    const definitions = {}

    for ( const key in publicRuntimeConfig ) {
        definitions[`this.$config.${key}`] = JSON.stringify( publicRuntimeConfig[key] )
        definitions[`global.$config.${key}`] = JSON.stringify( publicRuntimeConfig[key] )
        definitions[`global.$config`] = JSON.stringify( publicRuntimeConfig )
    }

    return definitions
}

import dotenv from 'dotenv'

dotenv.config()

const fallbackVerbiage = {
    macs: 'Apple M4 Max or M3 Ultra Mac',
    processors: 'Apple M4 Max and M3 Ultra'
}

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
    macsVerbiage: getRuntimeValue( process.env.npm_package_config_verbiage_macs, fallbackVerbiage.macs ),
    processorsVerbiage: getRuntimeValue( process.env.npm_package_config_verbiage_processors, fallbackVerbiage.processors ),
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

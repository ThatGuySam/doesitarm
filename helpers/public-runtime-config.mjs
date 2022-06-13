import dotenv from 'dotenv'

dotenv.config()



export const publicRuntimeConfig = {
    allUpdateSubscribe: process.env.ALL_UPDATE_SUBSCRIBE,
    testResultStore: process.env.TEST_RESULT_STORE,
    siteUrl: process.env.URL,
    macsVerbiage: process.env.npm_package_config_verbiage_macs,
    processorsVerbiage: process.env.npm_package_config_verbiage_processors,
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

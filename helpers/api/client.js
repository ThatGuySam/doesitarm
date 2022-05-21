// Based on GitHub Proxy demo
// https://gist.github.com/v1vendi/75d5e5dad7a2d1ef3fcb48234e4528cb

// Example uses:

// DoesItAPI.get() // GET /api
// DoesItAPI.apps.get() // GET /api/apps.json
// DoesItAPI.apps(7).get() // GET /api/apps/7.json
// DoesItAPI.apps(7).whatever.delete() // DELETE /api/apps/7/whatever.json
// DoesItAPI.apps.put({ whatever: 1 })

// GET /api/tiles/public/static/3/4/2.json?turn=37038&games=wot
// DoesItAPI.tiles.public.static(3)(4)(`${2}.json`).get({ turn: 37, games: 'wot' })

import axios from 'axios'

import { getApiUrl } from '~/helpers/url.js'

// const defaultFetchMethod = (...args) => console.log(...args) // mock

const defaultFetchMethod = async function (...args) {
    return axios(...args)
        .then( response => response.data )
        .catch( error => {
            console.error( error )
            throw error
        })
}


const HTTP_METHODS = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH'
]

const apiBaseUrl = `${ getApiUrl().replace(/\/$/, '') }/api`


export function generateAPI ( {
    apiUrl = apiBaseUrl,
    fetchMethod = defaultFetchMethod
} = {} ) {

    // console.log( 'apiUrl', apiUrl )

    // a hack, so we can use field either as property or a method
    const callable = () => {}
    callable.url = apiUrl

    return new Proxy(callable, {
        get({ url }, propKey) {
            // If we're just getting the url, return it
            if ( propKey === 'url' ) return url

            // If we're using an HTTP method
            // then do a request to the url
            if ( HTTP_METHODS.includes(propKey.toUpperCase()) ) {
                return (data) => fetchMethod({
                    url: `${ url }.json`,
                    method: propKey.toUpperCase(),
                    data
                })
            }

            // Otherwise drill down to the next property
            // Example:
            // From DoesItAPI.kind...
            // To DoesItAPI.kind.apps...
            return generateAPI({ apiUrl: `${url}/${propKey}` })

        },
        apply({ url }, thisArg, [arg] = []) {
            const apiUrl = arg ? `${url}/${arg}` : url
            return generateAPI({ apiUrl: apiUrl })
        }
    })

}

export const DoesItAPI = generateAPI()

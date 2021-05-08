import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { getAppType } from '../helpers/app-derived.js'

import { AppTemplate } from './app.11ty.js'

// import VideoRow from '../components-eleventy/video/row.js'
// import { isVideo } from '../helpers/app-derived'

// Setup dotenv
dotenv.config()

export const makeTitle = function ( app ) {
    return `Does ${app.name} work on Apple Silicon? - ${ config.head.title }`
}

export const makeDescription = function ( app ) {
    return `Latest reported support status of ${ app.name } on Apple Silicon and Apple M1 Processors when installed via Homebrew. `
}

class FormulaTemplate extends AppTemplate {
    // or `async data() {`
    // or `get data() {`
    data () {
        return {
            layout: 'default.11ty.js',

            pagination: {
                data: 'eleventy-endpoints',
                size: 1,
                alias: 'app',
                before: function( data ) {
                    return data.filter( entry => {
                        // Skip endpoints with no payload
                        if ( entry === undefined || !entry.hasOwnProperty('payload') ) return false

                        const appType = getAppType( entry.payload.app )

                        return appType === 'formula'
                    })
                }
            },

            eleventyComputed: {
                title: ({ app: { payload: { app } }  }) => {
                    // console.log('data', data)
                    return makeTitle( app )
                },
                description: ({ app: { payload: { app } }  }) => {
                    return makeDescription( app )
                },
                mainHeading: ({ app: { payload: { app } }  }) => {
                    return `Does <code>${ app.name }</code> work on Apple Silicon when installed via Homebrew?`
                }
            },

            permalink: ({ app }) => {
                // console.log('payload', app.payload)
                return app.route.substring(1) + '/'
            }
        }
    }

}

module.exports = FormulaTemplate

import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { getAppType } from '../helpers/app-derived.js'

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

class FormulaTemplate {
    // or `async data() {`
    // or `get data() {`
    data () {
        return {
            layout: 'default.11ty.js',

            pagination: {
                data: 'eleventy-endpoints',
                size: 1,
                alias: 'formula',
                before: function( data ) {
                    return data.filter( entry => {
                        const appType = getAppType( entry.payload.app )

                        return appType === 'formula'
                    })
                }
            },

            eleventyComputed: {
                title: ({ formula: { payload: { app } }  }) => {
                    // console.log('data', data)
                    return makeTitle( app )
                },
                description: ({ formula: { payload: { app } }  }) => {
                    return makeDescription( app )
                },
            },

            permalink: ({ formula }) => {
                // console.log('payload', formula.payload)
                return formula.route.substring(1) + '/'
            }
        }
    }

    render({ formula: { payload: { app } } }) {

        // console.log('video.payload', Object.keys(video.payload))

        const relatedLinksHtml = app.relatedLinks.map( (link, i) => {
            return /* html */`
                <a
                    class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow focus:shadow-outline-indigo bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out"
                    href="${link.href}"
                    target="_blank"
                    rel="noopener"
                    role="button"
                >${ (i === 0) ? 'View' : link.label }</a>
            `
        } ).join('')

        return /* html */`
            <section class="container pb-16">
                <div class="flex flex-col items-center text-center">
                    <h1 class="title text-sm md:text-2xl font-bold">
                        Does <code>${ app.name }</code> work on Apple Silicon when installed via Homebrew?
                    </h1>
                    <h2 class="subtitle text-2xl md:text-5xl font-bold py-6">
                        ${ app.text }
                    </h2>

                    <div class="comments text-sm mb-8">
                        ${ app.content }
                    </div>

                    <div class="links space-y-6 sm:space-x-6 mb-8">
                        ${ relatedLinksHtml }
                    </div>
                </div>
            </section>
        `
    }
}

module.exports = FormulaTemplate

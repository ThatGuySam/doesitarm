import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { getAppType, getAppEndpoint } from '../helpers/app-derived.js'
import { makeLastUpdatedFriendly } from '../helpers/parse-date'


import VideoRow from '../components-eleventy/video/row.js'

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

export class AppTemplate {
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
                    return data.filter( endpoint => {
                        const appType = getAppType( endpoint.payload.app )

                        return appType === 'app' && endpoint.route === getAppEndpoint( endpoint.payload.app )
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
                    return `Does ${ app.name } work on Apple Silicon?`
                },
            },

            permalink: ({ app }) => {
                // console.log('payload', app.payload)
                return app.route.substring(1) + '/'
            }
        }
    }

    render( data ) {

        const { app: { payload: { app, relatedVideos = [] } } } = data

        // console.log('video.payload', Object.keys(video.payload))

        const lastUpdatedFriendly = makeLastUpdatedFriendly( app.lastUpdated )

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
            <section class="container py-32">
                <div class="flex flex-col items-center text-center">
                    <h1 class="title text-sm md:text-2xl font-bold">
                        ${ data.mainHeading }
                    </h1>
                    <h2 class="subtitle text-2xl md:text-5xl font-bold py-6">
                        ${ app.text }
                    </h2>

                    <div class="subscribe">
                        <iframe src="/embed-subscribe" loading="lazy" style="width: 350px; height: 150px;" class="-my-8"></iframe>
                    </div>

                    <div class="links space-y-6 sm:space-x-6 mb-8">
                        ${ relatedLinksHtml }
                    </div>
                </div>

                ${ relatedVideos.length > 0 ? /* html */`
                    <div
                        v-if="relatedVideos.length !== 0"
                        class="related-videos w-full"
                    >
                        <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                            Related Videos
                        </h2>

                        ${ this.boundComponent(VideoRow)( relatedVideos ) }

                    </div>
                ` : '' }

                <div class="report-update text-xs text-center w-full shadow-none py-24">
                    ${ lastUpdatedFriendly !== null ? /* html */`
                        <div>
                            <time
                                datetime="${ app.lastUpdated.raw }"
                            >
                                Last Updated ${ lastUpdatedFriendly }
                            </time>
                        </div>
                    ` : '' }
                    <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                    <a
                        href="https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${ app.name }"
                        target="_blank"
                        class="underline"
                        rel="noopener"
                    >Report Update</a>
                </div>

            </section>
        `
    }
}

module.exports = AppTemplate
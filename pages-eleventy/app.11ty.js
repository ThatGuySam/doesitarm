import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { getAppType, getRouteType } from '../helpers/app-derived.js'
import { deviceSupportsApp } from '../helpers/devices.js'
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
    return `Latest reported support status of ${ app.name } on Apple Silicon and Apple M1 Processors.`
}

// https://stackoverflow.com/a/15069646/1397641
function makeEnglishList ( array, conjunction = 'and' ) {
    const total = array.length

    if ( total < 3 ) return array.join(` ${conjunction} `)

    array = array.slice()

    // Prepend conjunction to final part
    array[ total-1 ] = `${ conjunction } ${ array[ total-1 ] }`

    return array.join(', ')
}

export function renderPageLinksHtml ( links ) {
    return links.map( (link, i) => {

        const notAppTestLink = !link.label.includes('🧪')

        const isMainLink = (i === 0) && notAppTestLink

        return /* html */`
            <a
                class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow focus:shadow-outline-indigo bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out"
                href="${link.href}"
                target="_blank"
                rel="noopener"
                role="button"
            >${ isMainLink ? 'View' : link.label }</a>
        `
    } ).join('')
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
                    return data.filter( entry => {
                        // const [ _, routeType ] = entry.route.split('/')
                        const routeType = getRouteType( entry.route )

                        return routeType === 'app'
                    })
                }
            },

            eleventyComputed: {
                title: ({ app: { payload: { app } } }) => {
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

    async render( data ) {

        const {
            app: { payload: { app, relatedVideos = [] } },
            'device-list': deviceList
        } = data

        const hasRelatedVideos = relatedVideos.length > 0

        // console.log('deviceList', deviceList)

        // console.log('video.payload', Object.keys(video.payload))

        const hasMultipleAliases = !!app.aliases && app.aliases.length > 1

        const appDeviceSupport = deviceList.map( device => {
            const supportsApp = deviceSupportsApp( device, app )
            return {
                ...device,
                emoji: supportsApp ? '✅' : '🚫',
                ariaLabel: `${app.name} has ${ supportsApp ? '' : 'not' } been reported to work on ${device.name}`
            }
        })

        const lastUpdatedFriendly = makeLastUpdatedFriendly( app.lastUpdated )

        const relatedLinksHtml = renderPageLinksHtml( app.relatedLinks )


        const relatedVideosRowHtml = hasRelatedVideos ? await this.boundComponent(VideoRow)( relatedVideos ) : null

        return /* html */`
            <section class="container space-y-8 py-32">

                <div class="intro-content flex flex-col items-center text-center min-h-3/4-screen md:min-h-0 space-y-8">
                    <h1 class="title text-sm md:text-2xl font-bold">
                        ${ data.mainHeading }
                    </h1>
                    <h2 class="subtitle text-2xl md:text-5xl font-bold">
                        ${ app.text }
                    </h2>

                    ${ hasMultipleAliases ? /* html */`
                        <small class="text-xs opacity-75">May also be known as ${ makeEnglishList( app.aliases, 'or' ) }</small>
                    ` : '' }

                    <div class="subscribe">
                        <iframe src="/embed-subscribe" loading="lazy" style="width: 350px; height: 150px;" class="-my-10"></iframe>
                    </div>

                    <div class="links space-y-6 sm:space-x-6">
                        ${ relatedLinksHtml }
                    </div>

                    <div class="device-support w-full">
                        <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                            Device Support
                        </h2>
                        <div class="device-support-apps md:inline-flex max-w-4xl overflow-x-auto overflow-y-visible md:whitespace-no-wrap border rounded-lg divide-y md:divide-y-0 md:divide-x divide-gray-700 space-y-3 md:space-y-0 py-4 px-3">

                            ${ appDeviceSupport.map( device => /* html */`
                                <div class="device-container w-full md:w-auto inline-flex flex-col space-y-2 px-2">
                                    <a
                                        href="${ device.endpoint }"
                                        role="button"
                                        class="device-link block rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow p-2"
                                        aria-label="${ device.ariaLabel }"
                                    >${ device.emoji } ${ device.name }</a>

                                    <a href="${ device.amazonUrl }" target="_blank" class="underline text-xs pb-3" rel="noopener">Check Pricing</a>
                                </div>
                            `).join('') }

                        </div>
                    </div>
                </div>

                ${ hasRelatedVideos ? /* html */`
                    <div
                        class="related-videos w-full"
                    >
                        <h2 class="subtitle text-xl md:text-2xl text-center font-bold mb-3">
                            Related Videos
                        </h2>

                        ${ relatedVideosRowHtml }

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

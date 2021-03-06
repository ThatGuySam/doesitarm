import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import VideoPlayer from '../components-eleventy/video/player.js'
import VideoRow from '../components-eleventy/video/row.js'

import { getRouteType } from '../helpers/app-derived.js'
import { buildVideoStructuredData } from '../helpers/structured-data.js'

// Setup dotenv
dotenv.config()

export const myChannelId = 'UCB3jOb5QVjX7lYecvyCoTqQ'

export const makeTitle = function ( name ) {
    // console.log('tvEntry', tvEntry)

    return `${ name } - ${ config.head.title }`
}

export const makeDescription = function ( tvEntry ) {
    if ( tvEntry.payload.featuredApps.length === 0 ) return 'Apple Silicon performance and support videos'

    const featuredAppsString = tvEntry.payload.featuredApps.slice(0, 5).map(app => app.name).join(', ')

    // console.log('tvEntry.payload.featuredApps', tvEntry.payload.featuredApps)

    return `Apple Silicon performance and support videos for ${ featuredAppsString }`
}


function renderFeaturedApps ( featuredApps ) {
    return /* html */`
<div
    class="related-apps w-full"
>
    <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
        Related Apps
    </h2>
    <div class="featured-apps overflow-x-auto overflow-y-visible whitespace-no-wrap py-2 space-x-2">
        ${ featuredApps.map( app => ( /* html */`
            <a
                href="${ app.endpoint }"
                role="button"
                class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2"
            >${ app.name }</a>
        `) ).join('') }
    </div>
</div>
    `
}

class TV {
    // or `async data() {`
    // or `get data() {`
    data () {
        return {
            layout: 'default.11ty.js',

            pagination: {
                data: 'eleventy-endpoints',
                size: 1,
                alias: 'tvEntry',
                before: function( endpoint ) {
                    // console.log('Before runs')

                    return endpoint.filter( entry => {
                        const routeType = getRouteType( entry.route )

                        return routeType === 'tv'
                    })
                },
            },

            // tags: [ 'tv' ],

            eleventyComputed: {
                title: data => {
                    // Declare dependencies for Eleventy
                    // https://www.11ty.dev/docs/data-computed/#declaring-your-dependencies
                    data.tvEntry

                    return makeTitle( data.tvEntry.payload.video.name )
                },
                description: ( data ) => {
                    // Declare dependencies for Eleventy
                    // https://www.11ty.dev/docs/data-computed/#declaring-your-dependencies
                    data.tvEntry

                    return makeDescription( data.tvEntry )
                },

                headLinkTags: data => {
                    // Declare dependencies for Eleventy
                    // https://www.11ty.dev/docs/data-computed/#declaring-your-dependencies
                    data.tvEntry

                    return [
                        // Preload video thumbnail
                        // <link rel="preload" as="image" href="img.png" />
                        {
                            'rel': 'preload',
                            'as': 'image',
                            'href': `https://i.ytimg.com/vi_webp/${ data.tvEntry.payload.video.id }/sddefault.webp`
                        },
                    ]
                },

                structuredData: data => {
                    // Declare dependencies for Eleventy
                    // https://www.11ty.dev/docs/data-computed/#declaring-your-dependencies
                    data.tvEntry

                    return buildVideoStructuredData( data.tvEntry.payload.video,  data.tvEntry.payload.featuredApps, {
                        siteUrl: process.env.URL
                    } )
                }
            },

            permalink: ( data ) => {

                return data.tvEntry.route.substring(1) + '/'
            }
        }
    }

    async render( data ) {

        const {
            tvEntry: {
                // route,
                payload: {
                    video,
                    relatedVideos = [],
                    featuredApps = []
                }
            },
            // 'device-list': deviceList
        } = data


        // console.log('video.payload', Object.keys(video.payload))

        const coverBottomHtml = /* html */`
            <div class="page-heading h-full flex items-end md:p-4">
                <h1 class="title text-xs text-left md:text-2xl font-bold">${ video.name }</h1>
            </div>
        `

        const playerHtml = await this.boundComponent(VideoPlayer)( video, {
            coverBottomHtml
        } )

        const hasFeaturedApps = featuredApps.length > 0
        const featuredAppsHtml = hasFeaturedApps ? renderFeaturedApps( featuredApps ) : ''

        const rowHtml = await this.boundComponent(VideoRow)( relatedVideos )

        // const rowHtml = renderedRow.join('')

        return /* html */`
            <section class="container pb-16">
                <div class="flex flex-col items-center text-center space-y-6">

                    ${ playerHtml }

                    <div class="md:flex w-full justify-between space-y-4 md:space-y-0 md:px-10">

                        ${ video.channel.id !== myChannelId ? /* html */`
                            <div
                                class="channel-credit"
                            >
                                <a
                                    href="https://www.youtube.com/channel/${ video.channel.id }?sub_confirmation=1"
                                    target="_blank"
                                    rel="noopener"
                                    role="button"
                                    class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow focus:shadow-outline-indigo bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out"
                                >Subscribe to ${ video.channel.name }</a>
                            </div>
                        ` : '' }
                    </div>

                    <hr class="w-full">

                    ${ featuredAppsHtml }

                    <div class="related-videos w-full">
                        <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">Related Videos</h2>

                        ${ rowHtml }

                    </div>

                </div>
            </section>
        `
    }
}

module.exports = TV

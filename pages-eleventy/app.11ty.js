import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { getAppType, getRouteType } from '../helpers/app-derived.js'
import { deviceSupportsApp } from '../helpers/devices.js'
import { makeLastUpdatedFriendly } from '../helpers/parse-date.js'
import { getStatusOfScan } from '../helpers/statuses.js'
import { isString } from '../helpers/check-types.js'


import VideoRow from '../components-eleventy/video/row.js'

// import VideoRow from '../components-eleventy/video/row.js'
// import { isVideo } from '../helpers/app-derived'

// Setup dotenv
dotenv.config()

export const makeTitle = function ( app ) {
    return `Does ${app.name} work on Apple Silicon? - ${ config.head.title }`
}

export const makeDescription = function ( app ) {
    return `Latest reported support status of ${ app.name } on Apple Silicon and Apple M1 Pro and M1 Max Processors.`
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

export function supportedArchitectures ( appScan ) {
    // if ( Array.isArray(appScan['Macho Meta']) ) {
    //     return appScan['Macho Meta'].map( architecture => architecture.processorType)
    // }

    // console.log('meta', appScan['Macho Meta'])

    if ( appScan['Macho Meta'].architectures === undefined ) return []

    return appScan['Macho Meta'].architectures
        .map( architecture => architecture.processorType)
        .filter(processorType => Number(processorType) !== 0)
}

function renderBundleDataLevel ( bundleLevelData, depth = 0 ) {

    const levelContainerClassses = 'border rounded-lg bg-black bg-opacity-10 space-y-4 p-4 mt-4'
    const maxDepth = 2

    if ( isString(bundleLevelData) ) {
        return bundleLevelData
    }

    if ( depth >= maxDepth ) {
        return /* html */`<pre class="border-dashed ${ levelContainerClassses }">${ JSON.stringify(bundleLevelData, undefined, 2) }</pre>`
    }

    if ( Array.isArray( bundleLevelData ) ) {
        const htmlList = bundleLevelData.map( ( bundleLevel ) => {
            return /* html */`<li>${ renderBundleDataLevel( bundleLevel, depth + 1 ) }</li>`
        } ).join('')

        return /* html */`<ul class="${ levelContainerClassses }">${ htmlList }</ul>`
    }

    if ( Object(bundleLevelData) === bundleLevelData ) {
        const htmlList = Object.entries(bundleLevelData).map( ( [key, bundleLevel] ) => {
            return /* html */`<li>${key} : ${ renderBundleDataLevel( bundleLevel, depth + 1 ) }</li>`
        } ).join('')

        return /* html */`
            <details>
                <summary>Details</summary>
                <ul class="${ levelContainerClassses }">${ htmlList }</ul>
            </details>
        `
    }

    return /* html */`${ JSON.stringify(bundleLevelData) }`
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
            'device-list': deviceList,
            // 'app-bundles': appBundlesFromFile
        } = data


        // console.log('appBundlesFromFile', appBundlesFromFile)

        const hasRelatedVideos = relatedVideos.length > 0

        // console.log('deviceList', deviceList)

        // console.log('video.payload', Object.keys(video.payload))

        const hasMultipleAliases = !!app.aliases && app.aliases.length > 1

        const hasBundleIdentifiers = !!app.bundleIds && app.bundleIds.length > 0

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

        const appBundles = [] //hasBundleIdentifiers ? app.bundleIds.map( bundleId => this.getAppBundles() ) : null

        if ( hasBundleIdentifiers ) {
            for ( const bundleIdentifier of app.bundleIds ) {
                const versions = await this.getAppVersions( bundleIdentifier )
                appBundles.push( [bundleIdentifier, versions] )
            }
        }


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


                ${ hasBundleIdentifiers ? /* html */`
                    <div class="app-bundles w-full">

                        <h2 class="subtitle text-xl md:text-2xl text-center font-bold mb-3">
                            App Bundles
                        </h2>

                        <div class="app-bundles-container border rounded-lg">

                            <div class="app-bundles-list md:inline-flex w-full overflow-x-auto overflow-y-visible md:whitespace-no-wrap divide-y md:divide-y-0 md:divide-x divide-gray-700 space-y-3 md:space-y-0 py-4 px-3">

                                ${ appBundles.map( ( [bundleIdentifier, versions] ) => /* html */`
                                    <div class="bundle-listing-container w-full md:w-auto inline-flex flex-col space-y-2 px-2">
                                        <a
                                            href="#bundle_identifier=${ bundleIdentifier }"
                                            role="button"
                                            class="bundle-link block rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-darker hover:neumorphic-shadow p-2"
                                            aria-label="${ bundleIdentifier }"
                                        >${ bundleIdentifier }</a>

                                    </div>
                                `).join('') }

                            </div>


                            <div class="app-bundle-detail-view space-y-12 py-6 px-5">
                                ${ appBundles.map( ( [bundleIdentifier, versions] ) => /* html */`
                                    <div id="bundle_identifier=${ bundleIdentifier }" class="bundle-detail-container w-full space-y-2 px-2">
                                        <h3
                                            class="text-2xl font-bold"
                                        >${ bundleIdentifier }</h3>

                                        <div class="bundle-versions-container border rounded-lg bg-black bg-opacity-10">

                                            <div class="app-bundles-list md:inline-flex w-full overflow-x-auto overflow-y-visible md:whitespace-no-wrap divide-y md:divide-y-0 md:divide-x divide-gray-700 space-y-3 md:space-y-0 py-4 px-3">

                                                ${ Object.entries(versions).sort((a, b) => new Date(b[1]['Date']) - new Date(a[1]['Date'])).map( ( [ version, report ] ) => /* html */`
                                                    <div class="bundle-listing-container w-full md:w-auto inline-flex flex-col space-y-2 p-4">
                                                        <div class="version-heading font-bold text-xl">v${ version }</div>
                                                        <div class="version-body divide-y-0 py-2">
                                                            <div class="version-status">
                                                                ${ getStatusOfScan( report, false ) }
                                                            </div>
                                                            <div class="version-architecture">
                                                                🖥 Supported Architectures <span class="rounded bg-black bg-opacity-50 p-1">${ supportedArchitectures( report ).join(', ') }</span>
                                                            </div>
                                                        </div>
                                                        <details>
                                                            <summary class="text-xs">Full Info Plist</summary>
                                                            <pre class="border-dashed border rounded-lg bg-black bg-opacity-10 space-y-4 p-4 mt-4">${ JSON.stringify(report['Info Plist'], undefined, 2) }</pre>
                                                        </details>
                                                        <details>
                                                            <summary class="text-xs">Full Meta Details</summary>
                                                            <pre class="border-dashed border rounded-lg bg-black bg-opacity-10 space-y-4 p-4 mt-4">${ JSON.stringify(report['Macho Meta'], undefined, 2) }</pre>
                                                        </details>
                                                    </div>
                                                `).join('') }

                                            </div>

                                        </div>
                                    </div>
                                `).join('') }
                            </div>

                        </div>


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

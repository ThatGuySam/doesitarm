import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { hasStory, getStoryEndpoint } from '../helpers/app-derived.js'
import { makeLastUpdatedFriendly } from '../helpers/parse-date'

import {
    makeFullUrlFromPath
} from '../layouts-eleventy/default.11ty.js'

import CoverPage from '../components-eleventy/story/cover.js'
import YoutubePage from '../components-eleventy/story/youtube.js'


// import VideoRow from '../components-eleventy/video/row.js'

// import VideoRow from '../components-eleventy/video/row.js'
// import { isVideo } from '../helpers/app-derived'

// Setup dotenv
dotenv.config()

export const makeTitle = function ( app ) {
    return `${app.name} on Apple Silicon and Apple M1 - ${ config.head.title }`
}

export const makeDescription = function ( app ) {
    return `Reported status of ${ app.name } on Apple Silicon and the new Apple Macs. `
}

// https://stackoverflow.com/a/34015511/1397641
function makeJsonLdDate ( dateObject ) {
    return dateObject.toLocaleDateString('en-US')
}

function makeJsonLdObject ( data ) {

    const {
        page,
        app
    } = data

    const fullUrl = makeFullUrlFromPath( page.url )

    // console.log('app', app.payload.app )

    return {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": fullUrl
        },
        "headline": data.mainHeading,
        "description": data.description,
        // "datePublished": makeJsonLdDate( new Date( app.payload.app.lastUpdated.raw ) ),
        "dateModified": makeJsonLdDate( new Date( app.payload.app.lastUpdated.raw ) ),
        "author":{
            "@type": "Organization",
            "name": "Does It ARM"
        },
        "publisher":{
            "@type": "Organization",
            "name": "Does It ARM",
            "logo": {
                "@type": "ImageObject",
                "url": "/images/mark.png",
                "width": 100,
                "height": 100
            }
        }
    }
}

function makeBookend () {
    return {
        "bookendVersion": "v1.0",
        "shareProviders": [
            "system",
            "email",
            "twitter",
            "sms"
        ],
        "components": [
            {
                "type": "cta-link",
                "links": [
                    {
                        "text": "Search Other Apps",
                        "url": "doesitarm.com"
                    },
                    {
                        "text": "Get App Updates",
                        "url": "doesitarm.com/embed-subscribe"
                    }
                ]
            }
        ]
    }
}

const bookendJson = JSON.stringify( makeBookend() )

export class Story {
    // or `async data() {`
    // or `get data() {`
    data () {
        return {
            layout: 'story.11ty.js',

            pagination: {
                data: 'eleventy-endpoints',
                size: 1,
                alias: 'app',

                before: function( data ) {
                    return data.filter( entry => {
                        // const appType = getAppType( entry.payload.app )

                        // return hasStory ( entry.payload.app ) && entry.route === getStoryEndpoint( entry.payload.app )

                        return entry.route.includes('/photoshop/story/')
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
                jsonLd: data => makeJsonLdObject( data ),
                lastUpdatedDate: data => new Date( data.app.payload.app.lastUpdated.raw )
            },

            permalink: ({ app }) => {
                // console.log('payload', app.route)
                return app.route//.substring(1) + '/story/'
            }
        }
    }

    buildPages ( data ) {
        const pages = []

        const {
            // content,
            // title = null,
            app: {
                payload: {
                    app
                }
            }
        } = data


        // console.log('video.payload', Object.keys(video.payload))

        const lastUpdatedFriendly = makeLastUpdatedFriendly( app.lastUpdated )

        // Build cover page
        pages.push({
            template: CoverPage,
            heading: `${ app.name } has  been reported to support Apple Silicon natively as of ${lastUpdatedFriendly}!`,
            headingUrl: '',
            imageUrl: '/images/backgrounds/liquid-cheese.svg'
        })

        // console.log('app', app)

        if (Array.isArray( app.relatedVideos ) && app.relatedVideos.length > 0 ) {
            app.relatedVideos.forEach( video => {
                pages.push({
                    template: YoutubePage,
                    videoId: 'dQw4w9WgXcQ'
                })
            })
        }

        return pages
    }

    render( data ) {

        // const { app: { payload: { app } } } = data

        const {
            // content,
            title = null,
            app: {
                payload: {
                    app
                }
            }
        } = data

        const pageTitle = title || this.getNuxt().head.title


        // console.log('video.payload', Object.keys(video.payload))

        const lastUpdatedFriendly = makeLastUpdatedFriendly( app.lastUpdated )
        // const jsonLd = JSON.stringify( makeJsonLdObject( data ) )

        const pages = this.buildPages( data )

        const pagesHtml = pages.map( page => {
            return this.boundComponent( page.template )( page )
        } ).join('')

        return /* html */`
            <amp-story standalone poster-portrait-src="/images/poster-portrait.jpeg" publisher-logo-src="/images/mark.png" publisher="Does It ARM" title="Does It ARM" poster-landscape-src="/images/poster-landscape.jpeg" poster-square-src="/images/poster-landscape.jpeg">

                    ${ pagesHtml }

                    <!-- PAGE 1 STARTS HERE -->
                    <amp-story-page id="jlqerrcdhz" class="jlqerrcdhz ms-st-pg"  >
                        <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) -->
                        <amp-story-grid-layer template="fill" class="pbxiyzxp">
                            <amp-img width='720' height='1280' layout='responsive' class='pbxiyzx' id='jlqerrcdhz-bg' src='/images/backgrounds/liquid-cheese.svg' alt='App is now native' ></amp-img>
                        </amp-story-grid-layer>
                        <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) ENDS -->
                        <amp-story-grid-layer template="vertical" id="vsyyg" class="scrim"><div class="letterbox">
                            <!-- The best therapist has fur and four legs STARTS HERE -->
                            <h1 class='zegok pa' animate-in='fade-in' animate-in-duration='500ms' id='workflow-text' >Ack has&nbsp; been reported to support Apple Silicon natively as of ${lastUpdatedFriendly}!<a href='https://doesitarm.com/formula/ack/' role='link' data-tooltip-text='Details' class='story-tooltip pa' data-tooltip-icon='https://www.google.com/s2/favicons?domain=https://doesitarm.com/formula/ack/' data-vars-ctalink='https://doesitarm.com/formula/ack/' ></a></h1>
                            <!-- The best therapist has fur and four legs ENDS HERE -->
                        </div></amp-story-grid-layer>

                    </amp-story-page>
                    <!-- PAGE 1 ENDS HERE -->

                    <!-- PAGE 2 STARTS HERE -->
                    <amp-story-page id="fbttedbsmc" class="fbttedbsmc ms-st-pg"  >
                        <!-- PAGE BACKGROUND LAYER (fbttedbsmc) -->
                        <amp-story-grid-layer template="fill" class="pbgmmaxp">
                            <amp-img width='720' height='1280' layout='responsive' class='pbgmmax' id='fbttedbsmc-bg' src='assets/1.png' alt='App is now native' ></amp-img>
                        </amp-story-grid-layer>
                        <!-- PAGE BACKGROUND LAYER (fbttedbsmc) ENDS -->
                        <amp-story-grid-layer template="vertical" id="ptttz" class="scrim"><div class="letterbox">
                            <!-- The best therapist has fur and four legs STARTS HERE -->
                            <h1 class='rqzpl pa' animate-in='fade-in' animate-in-duration='500ms' id='lghxplitnh' >ack has will support Apple Silicon and take full advantage of new higher perfomance Macs.&nbsp;<a href='https://doesitarm.com/formula/ack/' role='link' data-tooltip-text='Details' class='story-tooltip pa' data-tooltip-icon='https://www.google.com/s2/favicons?domain=https://doesitarm.com/formula/ack/' data-vars-ctalink='https://doesitarm.com/formula/ack/' ></a></h1>
                            <!-- The best therapist has fur and four legs ENDS HERE -->
                        </div></amp-story-grid-layer>

                    </amp-story-page>
                    <!-- PAGE 2 ENDS HERE -->

                    <!-- PAGE 3 STARTS HERE -->
                    <amp-story-page id="vkmxqexwmf" class="vkmxqexwmf ms-st-pg"  >
                        <!-- PAGE BACKGROUND LAYER (vkmxqexwmf) -->
                        <amp-story-grid-layer template="fill" class="pbxnmpgp">
                            <amp-img width='720' height='1280' layout='responsive' class='pbxnmpg' id='vkmxqexwmf-bg' src='assets/1.png' alt='App is now native' ></amp-img>
                        </amp-story-grid-layer>
                        <!-- PAGE BACKGROUND LAYER (vkmxqexwmf) ENDS -->
                        <amp-story-grid-layer template="vertical" id="zuxpp" class="scrim"><div class="letterbox">
                            <!-- The best therapist has fur and four legs STARTS HERE -->
                            <h1 class='awhlw pa' animate-in='fade-in' animate-in-duration='500ms' id='qwtfraqrbe' >This will apply to ack version 3.0.2 and newer&nbsp;<a href='https://doesitarm.com/formula/ack/' role='link' data-tooltip-text='Details' class='story-tooltip pa' data-tooltip-icon='https://www.google.com/s2/favicons?domain=https://doesitarm.com/formula/ack/' data-vars-ctalink='https://doesitarm.com/formula/ack/' ></a></h1>
                            <!-- The best therapist has fur and four legs ENDS HERE -->
                        </div></amp-story-grid-layer>

                    </amp-story-page>
                    <!-- PAGE 3 ENDS HERE -->

                    <!-- PAGE 4 STARTS HERE -->
                    <amp-story-page id="ealonwjwyf" class="ealonwjwyf ms-st-pg"  >
                        <!-- PAGE BACKGROUND LAYER (ealonwjwyf) -->
                        <amp-story-grid-layer template="fill" class="pbnrcrzp">
                            <amp-img width='720' height='1280' layout='responsive' class='pbnrcrz' id='ealonwjwyf-bg' src='assets/2.jpeg' alt='App is now native' ></amp-img>
                        </amp-story-grid-layer>
                        <!-- PAGE BACKGROUND LAYER (ealonwjwyf) ENDS -->
                        <amp-story-grid-layer template="vertical" id="eszze" class="scrim"><div class="letterbox">
                            <!-- The best therapist has fur and four legs STARTS HERE -->
                            <h1 class='vlsci pa' id='yxdyvhijcn' >The best therapist has fur and four legs</h1>
                            <!-- The best therapist has fur and four legs ENDS HERE -->
                            <!-- cta_1 STARTS HERE -->

                            <!-- cta_1 ENDS HERE -->
                        </div></amp-story-grid-layer>
                        <amp-story-cta-layer>
                            <div class="letterbox">
                            <a class='rzjym pa cta-a' href='https://www.google.com/search?q=dog+therapy' id='ctaId' data-vars-ctalink='https://www.google.com/search?q=dog+therapy' ><span>Find More</span></a>
                            </div>
                        </amp-story-cta-layer>

                    </amp-story-page>
                    <!-- PAGE 4 ENDS HERE -->

                    <!-- https://amp.dev/documentation/components/amp-story-bookend/ -->
                    <amp-story-bookend layout="nodisplay">
                        <script type="application/json">
                        ${ bookendJson }
                        </script>
                    </amp-story-bookend>
                </amp-story>
        `
    }
}

module.exports = Story

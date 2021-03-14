import dotenv from 'dotenv'

import config from '../nuxt.config.js'

import { hasStory, getStoryEndpoint } from '../helpers/app-derived.js'
import { makeLastUpdatedFriendly } from '../helpers/parse-date'


// import VideoRow from '../components-eleventy/video/row.js'

// import VideoRow from '../components-eleventy/video/row.js'
// import { isVideo } from '../helpers/app-derived'

// Setup dotenv
dotenv.config()

export const makeTitle = function ( app ) {
    return `${app.name} on Apple Silicon and Apple M1 - ${ config.head.title }`
}

export const makeDescription = function ( app ) {
    return `Latest reported support status of ${ app.name } on Apple Silicon and Apple M1 Processors when installed via Homebrew. `
}

export class Story {
    // or `async data() {`
    // or `get data() {`
    data () {
        return {
            // layout: 'default.11ty.js',

            pagination: {
                data: 'eleventy-endpoints',
                size: 1,
                alias: 'app',

                before: function( data ) {
                    return data.filter( entry => {
                        // const appType = getAppType( entry.payload.app )

                        return hasStory ( entry.payload.app ) && entry.route === getStoryEndpoint( entry.payload.app )
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
                return app.route.substring(1) + '/story/'
            }
        }
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

        // const lastUpdatedFriendly = makeLastUpdatedFriendly( app.lastUpdated )

        return /* html */`
        <!doctype html>
        <html amp lang="en">
            <head>
                <meta charset="utf-8">
                <link href="https://cdn.ampproject.org/v0.js" rel="preload" as="script" />
                <script async src="https://cdn.ampproject.org/v0.js"></script>
                <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
                <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
                <meta name="amp-story-generator-name" content="DoesItARM" />
                <meta name="amp-story-generator-version" content="1.0" />



                <title>${ pageTitle }</title>
                <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>


                <meta name="description"  property="description" content="Check the the latest reported support status of ack on Apple Silicon and Apple M1 Processors. ">
                <link rel="shortcut icon" href="assets/3.png" type="image/x-icon">

                <script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","mainEntityOfPage":{"@type":"WebPage","@id":"https://doesitarm.com/formula/ack/story"},"headline":"Does It ARM","description":"App is now native to Apple Silicon","datePublished":"03/13/2021","dateModified":"03/13/2021","author":{"@type":"Organization","name":"Does It ARM"},"publisher":{"@type":"Organization","name":"Does It ARM","logo":{"@type":"ImageObject","url":"assets/3.png","width":100,"height":100}}}</script>

                <meta property="og:url" content="https://doesitarm.com/formula/ack/story" />
                <meta property="twitter:site" content="@DoesItARM" />
                <meta property="twitter:creator" content="@DoesItARM" />
                <meta property="title" content="Does It ARM" />
                <meta property="og:title" content="Does It ARM" />
                <meta property="twitter:title" content="Does It ARM" />
                <meta property="description" content="App is now native to Apple Silicon" />
                <meta property="og:description" content="App is now native to Apple Silicon" />
                <meta property="twitter:description" content="App is now native to Apple Silicon" />
                <meta property="og:published_time" content="2021-03-13T00:00:00.000Z" />
                <meta property="og:modified_time" content="2021-03-13T00:00:00.000Z" />
                <meta name="twitter:card" content="summary" />
                <meta property="og:type" content="article" />

                <link rel="canonical" href="https://doesitarm.com/formula/ack/story">

                <style amp-custom>



                .pbxiyzxp amp-img.pbxiyzx > img{
                    max-width : unset;
                    max-height : unset;
                    margin : 0;
                    height : 100%;
                    left : 0.00%;
                    object-fit : cover;
                    top : 0.00%;
                    width : 100%;
                }
                .scrim#vsyyg{
                    background : no-repeat linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 30%);
                }
                .zegok{
                    color : #fff;
                    font-family : Inter;
                    font-size : 3.02em;
                    font-weight : 300;
                    left : 10.56%;
                    letter-spacing : 0.03em;
                    line-height : 1.4em;
                    top : 46.50%;
                    width : 78.61%;
                }
                .pbgmmaxp amp-img.pbgmmax > img{
                    max-width : unset;
                    max-height : unset;
                    margin : 0;
                    height : 100%;
                    left : 0.00%;
                    object-fit : cover;
                    top : 0.00%;
                    width : 100%;
                }
                .scrim#ptttz{
                    background : no-repeat linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 30%);
                }
                .rqzpl{
                    color : #fff;
                    font-family : Inter;
                    font-size : 3.02em;
                    font-weight : 300;
                    left : 10.56%;
                    letter-spacing : 0.03em;
                    line-height : 1.4em;
                    top : 31.50%;
                    width : 78.61%;
                }
                .pbxnmpgp amp-img.pbxnmpg > img{
                    max-width : unset;
                    max-height : unset;
                    margin : 0;
                    height : 100%;
                    left : 0.00%;
                    object-fit : cover;
                    top : 0.00%;
                    width : 100%;
                }
                .scrim#zuxpp{
                    background : no-repeat linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 30%);
                }
                .awhlw{
                    color : #fff;
                    font-family : Inter;
                    font-size : 3.02em;
                    font-weight : 300;
                    left : 10.56%;
                    letter-spacing : 0.03em;
                    line-height : 1.4em;
                    top : 51.17%;
                    width : 78.61%;
                }
                .pbnrcrzp amp-img.pbnrcrz > img{
                    max-width : unset;
                    max-height : unset;
                    margin : 0;
                    height : 100%;
                    left : 0.00%;
                    object-fit : cover;
                    top : 0.00%;
                    width : 100%;
                }
                .scrim#eszze{
                    background : no-repeat linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 30%);
                }
                .vlsci{
                    color : #fff;
                    font-family : Inter;
                    font-size : 3.02em;
                    font-weight : 700;
                    left : 8.33%;
                    letter-spacing : 0.03em;
                    line-height : 1.4em;
                    top : 60.00%;
                    width : 83.33%;
                }
                .rzjym{
                    background : #1657cd;
                    border-radius : 5px;
                    color : #fff;
                    font-family : Inter;
                    font-size : 1.60em;
                    font-weight : 500;
                    height : 40px;
                    left : 8.33%;
                    line-height : 1.4em;
                    text-align : center;
                    top : 60px;
                    width : 83.33%;
                }
                amp-img{ position: relative }
                .content-block{ padding: 10px 15px }
                .block{ position: relative; padding: 5px;word-break: break-word;}
                .content-block amp-video{ display: block; margin: 0 auto}
                .content-block > hr {padding: 0;margin: 5px 0;border-top: 1px solid #eee}
                .block a:not(.cta-a) {color: inherit;text-decoration: none}
                p, h1, h2, h3, h4, h5, h6{ padding: 0;margin: 0 }
                .cta-a{
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                }
                .cta-a span{
                    width:100%;
                }
                .svg-el svg{
                    display: block;
                    width: 100%;
                    height: 100%;

                }
                .block .cta-a {
                    padding: 0.3em 1em;
                    display: inline-block;
                }
                *{
                    -webkit-box-sizing: border-box;
                    -moz-box-sizing: border-box;
                    box-sizing: border-box;
                }
                .cta-a amp-img{
                    width: 100%;
                    height: 100%;
                }
                .cta-a amp-img img{
                    height:100%;
                    width: 100%;
                    min-height: unset;
                }
                .flip-vertically img, .flip-vertically svg{
                    transform: rotateY(180deg);
                }
                .flip-horizontally img, .flip-horizontally svg{
                    transform: rotateX(180deg);
                }
                .flip-horizontally.flip-vertically img, .flip-horizontally.flip-vertically svg{
                    transform: rotateX(180deg) rotateY(180deg);
                }
                .pa{
                    position: absolute;
                    word-break: break-word;
                }
                .txt-hl{
                    -webkit-box-decoration-break: clone;
                    -o-box-decoration-break: clone;
                    box-decoration-break: clone;
                }
                .img-fill,a.story-tooltip{
                    top:0;
                    left:0;
                    width:100%;
                    height:100%;
                    font-size: inherit;
                    font-weight: inherit;
                }
                a.story-tooltip{

                    text-decoration: none;
                    color: inherit;
                }
                .offset{
                    transform: translateX(-50%) translateY(-50%)
                }
                .oh{
                    overflow: hidden;
                }
                .pa.kbimg{
                    width: 0;
                    height: 0
                }
                .pa-list-type{
                    padding:5px;
                    padding-left:19px;
                    margin:5px 0 0 0;
                }
                ol.pa-list-type{
                    list-style:lower-alpha;
                }
                .block .pa-list-type li a{color: #1890ff;}

                amp-story{
                    font-size:3.125vw
                }
                @media screen and (min-aspect-ratio: 3/5) and (max-aspect-ratio: 5/5){
                amp-story {
                    font-size: 1.875vh
                }
                .letterbox{
                    width:60vh;
                    height: 100vh;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                amp-story-cta-layer .letterbox{
                    height: 20vh;
                }
                }
                @media screen and (min-width:1024px){
                    amp-story{font-size:1.8vh}
                }
                @media screen and (min-width:1024px) and (max-height:660px){
                    amp-story{font-size:1.8vh}
                }
                ::cue {
                    background-color: rgba(0, 0, 0, 0.75);
                    font-size: 24px;
                    line-height: 1.5;
                }

                </style>

                <link rel="stylesheet" href="https://fonts.googleapis.com/css?display=swap&family=Inter:400,300" media="all">

            </head>
            <body>

            <amp-story standalone poster-portrait-src="assets/4.jpeg" publisher-logo-src="assets/3.png" publisher="Does It ARM" title="Does It ARM" poster-landscape-src="assets/5.jpeg" poster-square-src="assets/6.jpeg"    >

                <!-- PAGE 1 STARTS HERE -->
                <amp-story-page id="jlqerrcdhz" class="jlqerrcdhz ms-st-pg"  >
                    <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) -->
                    <amp-story-grid-layer template="fill" class="pbxiyzxp">
                        <amp-img width='720' height='1280' layout='responsive' class='pbxiyzx' id='jlqerrcdhz-bg' src='assets/1.png' alt='App is now native' ></amp-img>
                    </amp-story-grid-layer>
                    <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) ENDS -->
                    <amp-story-grid-layer template="vertical" id="vsyyg" class="scrim"><div class="letterbox">
                        <!-- The best therapist has fur and four legs STARTS HERE -->
                        <h1 class='zegok pa' animate-in='fade-in' animate-in-duration='500ms' id='workflow-text' >Ack has&nbsp; been reported to support Apple Silicon nativelty as of Oct 31st, 2020!<a href='https://doesitarm.com/formula/ack/' role='link' data-tooltip-text='Details' class='story-tooltip pa' data-tooltip-icon='https://www.google.com/s2/favicons?domain=https://doesitarm.com/formula/ack/' data-vars-ctalink='https://doesitarm.com/formula/ack/' ></a></h1>
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

                <amp-story-bookend src="https://doesitarm.com/formula/ack/story/bookend.json" layout="nodisplay"></amp-story-bookend>
            </amp-story>

            </body>
        </html>
        `
    }
}

module.exports = Story

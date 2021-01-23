import config from '../nuxt.config'

import VideoCard from '../components-eleventy/video/card.js'

class TV {
    // or `async data() {`
    // or `get data() {`
    data() {
        return {
            layout: 'default.11ty.js',

            pagination: {
                data: 'video-list',
                size: 1,
                alias: 'video'
            },

            eleventyComputed: {
                title: ({ video }) => {
                    // console.log('data', data)
                    return `${ video.name } - ${ config.head.title }`
                },
                // footerInlineScripts: () => [
                //     'node_modules/lazysizes/lazysizes.min.js'
                // ]
            },

            permalink: ({ video }) => {
                // console.log('data', data)
                return `tv/${ video.slug }/`
            }
        }
    }

    render({ name, video }) {

        // console.log('video.payload', Object.keys(video.payload))

        return /* html */`
            <section class="container pb-16">
                <div class="flex flex-col items-center text-center space-y-6">
                    <div class="video-canvas w-screen flex flex-col justify-center items-center bg-black pt-16" style="left:50%;right:50%;margin-left:-50vw;margin-right:-50vw;">
                        <div class="ratio-wrapper w-full max-w-4xl">
                            <div class="relative overflow-hidden w-full pb-16/9">
                                <iframe id="youtube-player-${ video.id }-17212" src="https://www.youtube-nocookie.com/embed/${ video.id }?enablejsapi=1&autoplay=1&modestbranding=1&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="absolute h-full w-full"></iframe>
                            </div>
                        </div>
                        <!---->
                    </div>
                    <div class="md:flex w-full justify-between space-y-4 md:space-y-0 md:px-10">
                        <h1 class="title text-lg md:text-2xl font-bold">${ video.name }</h1>
                        <div class="channel-credit"><a href="https://www.youtube.com/channel/UCptwuAv0XQHo1OQUSaO6NHw" target="_blank" rel="noopener" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow focus:shadow-outline-indigo bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out">Subscribe to Max Tech</a></div>
                    </div>

                    <hr class="w-full">

                    <div class="related-apps w-full">
                        <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">Related Apps</h2>
                        <div class="featured-apps overflow-x-auto overflow-y-visible whitespace-no-wrap py-2 space-x-2"><a href="/app/xcode" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Xcode</a><a href="/app/logic-pro" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Logic Pro</a><a href="/app/lightroom" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Lightroom</a><a href="/app/lightroom-classic" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Lightroom Classic</a><a href="/app/cinebench" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Cinebench</a><a href="/app/final-cut-pro" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Final Cut Pro</a><a href="/app/geekbench" role="button" class="relative inline-flex items-center rounded-md px-4 py-2 leading-5 font-bold text-white border border-transparent focus:outline-none focus:border-indigo-600 neumorphic-shadow-inner bg-darker hover:bg-indigo-400 active:bg-indigo-600 transition duration-150 ease-in-out inline-block text-xs rounded-lg py-1 px-2">Geekbench</a></div>
                    </div>

                    <div class="related-videos w-full">
                        <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">Related Videos</h2>
                        <div class="video-row relative w-full">
                            <div class="video-row-contents flex overflow-x-auto whitespace-no-wrap py-2 space-x-6" style="scroll-snap-type:x mandatory;">

                                ${ video.payload.relatedVideos.map( this.boundComponent(VideoCard) ).join('') }

                            </div>
                            <button class="absolute left-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 -translate-x-1/2 bg-darker rounded-full" style="top:50%;">
                                <svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5 text-gray-400" style="transform: scaleX(-1);">
                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
                                </svg>
                            </button>
                            <button class="absolute right-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 translate-x-1/2 bg-darker rounded-full" style="top:50%;">
                                <svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5 text-gray-400">
                                    <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
                                </svg>
                            </button>
                        </div>
                    </div>

                </div>
            </section>
        `
    }
}

module.exports = TV

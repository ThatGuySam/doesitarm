<template>
    <div
        :style="{
            'left': '50%',
            'right': '50%',
            'margin-left': '-50vw',
            'margin-right': '-50vw'
        }"
        class="video-canvas w-screen flex flex-col justify-center items-center bg-black"
    >
        <div class="ratio-wrapper w-full max-w-4xl">
            <div
                class="relative overflow-hidden w-full pb-16/9"
                @pointerover.once="warmConnections()"
            >
                <div
                    v-if="playerLoaded === false"
                    class="player-poster cursor-pointer"
                    @click="startPlayerLoad()"
                >
                    <picture
                        class=""
                    >
                        <source
                            v-for="(source, key) in posterSources"
                            :key="key"
                            :sizes="source.sizes"
                            :data-srcset="source.srcset"
                            :type="`image/${ key }`"
                        >
                        <img
                            :data-src="video.thumbnail.src"
                            :alt="video.name"
                            class="absolute inset-0  h-full w-full object-cover lazyload"
                        >
                    </picture>
                    <div
                        class="video-card-overlay absolute inset-0 flex flex-col justify-center items-center bg-gradient-to-tr from-black to-transparent p-4"
                        style="--gradient-from-color:rgba(0, 0, 0, 1); --gradient-to-color:rgba(0, 0, 0, 0.7);"
                    >
                        <div class="cover-top h-full">
                            <slot name="cover-top">
                                <!-- Top -->
                            </slot>
                        </div>


                        <div class="play-circle bg-white-2 bg-blur flex justify-center items-center outline-0 rounded-full ease p-4">
                            <svg
                                viewBox="0 0 18 18"
                                style="width:18px;height:18px;margin-left:3px"
                            >
                                <path
                                    fill="currentColor"
                                    d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"
                                />
                            </svg>
                        </div>

                        <div class="cover-bottom h-full">

                            <slot name="cover-bottom">
                                <!-- Bottom -->
                            </slot>

                        </div>

                    </div>
                </div>
                <iframe
                    v-else
                    ref="frame"
                    :id="frameId"
                    :src="`https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&modestbranding=1&playsinline=1`"
                    class="absolute inset-0 h-full w-full object-cover"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                />
            </div>

            <!-- <pre>
                hasPlayer: {{ hasPlayer }}
            </pre> -->

            <!-- <pre>
                player: {{ player }}
            </pre> -->

            <!-- <pre>
                timstamps: {{ video.timestamps }}
            </pre> -->
        </div>

        <div
            v-if="hasTimestamps"
            class="video-timestamps w-full max-w-4xl"
        >
            <div
                ref="timestamps-scroll-container"
                class="featured-apps overflow-x-auto overflow-y-visible whitespace-no-wrap py-2 space-x-2"
            >
                <button
                    v-for="timestamp in timestamps"
                    :key="timestamp.time"
                    :ref="`timestamp-${timestamp.time}`"
                    :data-time="timestamp.time"
                    :class="[
                        'inline-block text-xs rounded-lg py-1 px-2',
                        'border-2 border-white focus:outline-none',
                        (activeTimestamp && activeTimestamp.time === timestamp.time) ? 'border-opacity-100 bg-darkest' : 'border-opacity-0 neumorphic-shadow-inner'
                    ]"
                    :class-groups="{
                        shadow: 'neumorphic-shadow-inner'
                    }"
                    @click.stop="seekTo(timestamp.inSeconds)"
                >{{ timestamp.fullText }}</button>
            </div>

            <!-- activeTimestamp: {{ activeTimestamp }} -->
            <!-- playerTime: {{ playerTime }} -->
        </div>
    </div>
</template>

<script>
import 'lazysizes'

import LinkButton from '~/components-nuxt/link-button.vue'

export default {
    components: {
        LinkButton
    },
    props: {
        video: {
            type: Object,
            required: true
        }
    },
    data: function () {
        return {
            playerLoaded: false,
            player: null,
            playing: false,
            progressInterval: null,
            playerTime: 0,
            preconnected: false
        }
    },
    computed: {
        posterSources () {
            const webpSource = {
                ...this.video.thumbnail,
                srcset: this.video.thumbnail.srcset.replaceAll('ytimg.com/vi/', 'ytimg.com/vi_webp/').replace(/.png|.jpg|.jpeg/g, '.webp')
            }

            return {
                webp: webpSource,
                jpeg: this.video.thumbnail
            }
        },

        frameId () {
            return `youtube-player-${this.video.id}-${this._uid}`
        },
        timestamps () {
            return this.video.timestamps.map( timestamp => {
                const [ minutes, seconds ] = timestamp.time.split(':')

                return {
                    ...timestamp,
                    inSeconds: (minutes * 60) + Number(seconds)
                }
            })
        },
        hasTimestamps () {
            return this.timestamps.length > 0
        },
        hasPlayer () {
            return this.player !== null
        },
        activeTimestamp () {
            const currentTime = this.playerTime// / 100

            const reversesTimestamps = [
                ...this.timestamps
            ]

            // reversesTimestamps.reverse()

            let foundTimestamp = null

            for (const timestamp of reversesTimestamps) {
                const hasStarted = currentTime > 1
                const currentTimeisAfterPreviousTimestamp = (foundTimestamp !== null) ? currentTime > foundTimestamp.inSeconds : true
                // const isPastCurrentTime = currentTime > timestamp.inSeconds
                // const isBeforeCurrentTime = currentTime > timestamp.inSeconds
                const currentTimeIsBeforeThisTimestamp = currentTime < timestamp.inSeconds

                if (currentTimeisAfterPreviousTimestamp && currentTimeIsBeforeThisTimestamp) {
                    return foundTimestamp
                }

                foundTimestamp = timestamp
            }

            // No active timestamp
            return null
        }
    },
    watch: {
        // whenever question changes, this function will run
        activeTimestamp: function (newTimestamp, oldTimestamp) {

            // console.log('newTimestamp', newTimestamp)
            // console.log('oldTimestamp', oldTimestamp)

            const hasOldAndNewTimestamps = newTimestamp !== null && oldTimestamp !== null

            if (!hasOldAndNewTimestamps) return

            if (newTimestamp.inSeconds !== oldTimestamp.inSeconds) {
                this.scrollRow ( newTimestamp )
            }
        },

        video () {
            this.$nextTick(() => {
                this.initializePlayer()
            })
        }
    },
    mounted () {
        // Set frame ID here so that it's the same when Youtube API looks for it
        // this.frameId = `youtube-bg-${this._uid}`

        this.detectAutoplay()
            .then( ({ willAutoplay }) => {
                // If we're allowed to autoplay
                // then start loading the player
                if ( willAutoplay === true ) {
                    this.startPlayerLoad()
                }
            })
    },
    methods: {
        scrollRow ( timestamp ) {

            // If timestamp button doesn't exist
            // then stop
            if (!this.$refs[`timestamp-${timestamp.time}`]) return

            const timestampsScroller = this.$refs['timestamps-scroll-container']
            const [ timestampButton ] = this.$refs[`timestamp-${timestamp.time}`]

            // https://stackoverflow.com/a/63773123/1397641
            const newScrollPosition = timestampButton.offsetLeft - timestampsScroller.offsetLeft

            timestampsScroller.scroll({ left: newScrollPosition, behavior: 'smooth' })
        },

        async detectAutoplay () {

            if ( !process.client ) return { willAutoplay: false }

            const { default: canAutoPlay } = await import('can-autoplay')

            const willAutoplay = await canAutoPlay.video()
            // const willAutoplayMuted = await canAutoPlay.video({ muted: true, inline: true })

            return {
                willAutoplay: willAutoplay.result
            }
        },

        async seekTo (timestampInSeconds) {

            if (this.playerLoaded === false) {
                await this.startPlayerLoad()
            }

            this.player.seekTo(timestampInSeconds)
        },

        // async playVideo() {

        //     if (this.playerLoaded === false) {
        //         await this.startPlayerLoad()
        //     }

        //     this.$nextTick(() => {
        //         // console.log('this.player', JSON.stringify(this.player))
        //         this.player.playVideo()
        //     })
        // },

        addPrefetch(kind, url, as) {
            // console.log('prefetching', url)

            const linkEl = document.createElement('link')

            linkEl.rel = kind
            linkEl.href = url

            if (as) {
                linkEl.as = as;
            }

            document.head.append(linkEl)
        },

        warmConnections() {
            if (this.preconnected) return

            // The iframe document and most of its subresources come right off youtube.com
            this.addPrefetch('preconnect', 'https://www.youtube-nocookie.com')
            // The botguard script is fetched off from google.com
            this.addPrefetch('preconnect', 'https://www.google.com')

            // Not certain if these ad related domains are in the critical path. Could verify with domain-specific throttling.
            this.addPrefetch('preconnect', 'https://googleads.g.doubleclick.net')
            this.addPrefetch('preconnect', 'https://static.doubleclick.net')

            this.preconnected = true
        },

        async startPlayerLoad () {
            this.playerLoaded = true

            await this.initializePlayer()

            // this.$nextTick(() => {
            //     this.initializePlayer()
            // })
        },

        async initializePlayer () {
            // console.log('Youtube Embed API Ready')

            // Clear player
            this.player = null

            // Clear progession interval
            clearInterval(this.progressInterval)

            // If there are no timestamps
            // then stop
            if (!this.hasTimestamps) {
                this.playerLoaded = true
                return
            }

            if (typeof YT === 'undefined') {
                await this.initializeApi()
            }

            const stateHandlers = {
                // unstarted
                '-1': () => null,
                // ended
                '0': () => null,
                // playing
                '1': this.onPlayerPlaying,
                // paused
                '2': this.onPlayerPaused,
                // buffering
                '3': () => null,
                // video cued
                '4': () => null,
            }

            // console.log('frame', this.$refs['frame'])
            // console.log('frame id', this.$refs['frame'].id)

            const onReady = () => new Promise( resolve => {

                this.player = new YT.Player(this.$refs['frame'].id, {
                    events: {
                        'onReady': readyEvent => {
                            this.onPlayerReady( readyEvent )

                            resolve( readyEvent )
                        },
                        'onStateChange': event => {
                            // console.log('state changed', event)

                            const stateHandler = stateHandlers[String(event.data)]
                            // console.log('stateHandler', stateHandler)
                            stateHandler(event)
                        }
                    }
                })

            })

            await onReady()

            // console.log('Youtube Player API ready', JSON.stringify(this.player))
        },
        initializeApi () {
            return new Promise( resolve => {
                const tag = document.createElement('script')
                tag.id = `youtube-api-script-${this._uid}`
                tag.src = 'https://www.youtube.com/iframe_api'

                const firstScriptTag = document.getElementsByTagName('script')[0]
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)


                window.onYouTubeIframeAPIReady = resolve
            })
        },

        onPlayerPlaying () {
            console.log('Player playing')
            this.playing = true

            this.progressInterval = setInterval(() => {
                // console.log('this.player.getCurrentTime()', this.player.getCurrentTime())

                // If player is empty
                // then stop
                if (this.player === null) {
                    clearInterval(this.progressInterval)
                    return
                }

                // console.log('this.player', this.player.hasOwnProperty('getCurrentTime'))

                this.playerTime = this.player.getCurrentTime()
            }, 500)
        },
        onPlayerPaused () {
            console.log('Player paused')
            this.playing = false

            clearInterval(this.progressInterval)
        },
        onPlayerReady (event) {
            console.log('Player is ready', event, this.player )
        }
    }
}
</script>

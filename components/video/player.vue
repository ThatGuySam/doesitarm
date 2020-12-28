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
            <div class="relative overflow-hidden w-full pb-16/9">
                <iframe
                    ref="frame"
                    :id="frameId"
                    :src="`https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&modestbranding=1&playsinline=1`"
                    class="absolute h-full w-full"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                />
            </div>
        </div>

        <div
            v-if="hasTimestamps && hasPlayer"
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
                    @click.stop="seekTo(timestamp.inSeconds); player.playVideo()"
                >{{ timestamp.fullText }}</button>
            </div>

            <!-- activeTimestamp: {{ activeTimestamp }} -->
            <!-- playerTime: {{ playerTime }} -->
        </div>
    </div>
</template>

<script>
import LinkButton from '~/components/link-button.vue'

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
            player: null,
            playing: false,
            progressInterval: null,
            playerTime: 0
        }
    },
    computed: {
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

        this.initializePlayer()
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
        seekTo (timestampInSeconds) {
            this.player.seekTo(timestampInSeconds)
        },
        async initializePlayer () {
            // console.log('Youtube Embed API Ready')

            // Clear player
            this.player = null

            // Clear tprogession interval
            clearInterval(this.progressInterval)

            // If there are no timestamps
            // then stop
            if (!this.hasTimestamps) return

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

            this.player = new YT.Player(this.$refs['frame'].id, {
                events: {
                    'onReady': this.onPlayerReady,
                    'onStateChange': event => {
                        // console.log('state changed', event)

                        const stateHandler = stateHandlers[String(event.data)]
                        // console.log('stateHandler', stateHandler)
                        stateHandler(event)
                    }
                }
            })
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
            console.log('Player is ready', this.player)
        }
    }
}
</script>

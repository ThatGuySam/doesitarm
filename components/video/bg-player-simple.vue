<template>
    <div
        :style="{
            'left': '50%',
            'right': '50%',
            'margin-left': '-50vw',
            'margin-right': '-50vw',
            'mask-image': 'linear-gradient(to top, rgba(0, 0, 0, 0) 25%, rgba(0, 0, 0, 0.25))',
            // opacity: playing ? 1 : 0
        }"
        class="video-canvas w-screen flex justify-center bg-black transition-opacity duration-500 ease-in-out"
    >
        <div class="ratio-wrapper w-full">
            <div class="relative overflow-hidden w-full pb-16/9">
                <video
                    :src="`https://vumbnail.com/${ video.id }.mp4`"
                    :style="{
                        height: '200%',
                        top: '50%',
                        transform: 'translateY(-50%)'
                    }"
                    class="absolute w-full object-cover"
                    muted
                    autoplay
                    loop
                    playsinline
                />
            </div>
        </div>
    </div>
</template>

<script>

export default {
    // components: {
    //     VideoCard
    // },
    props: {
        video: {
            type: Object,
            required: true
        }
    },
    data: function() {
        return {
            player: null,
            playing: false
        }
    },
    computed: {
        frameId () {
            return `youtube-bg-${this._uid}`
        }
    },
    mounted () {
        // Set frame ID here so that it's the same when Youtube API looks for it
        // this.frameId = `youtube-bg-${this._uid}`

        const tag = document.createElement('script')
        tag.id = `youtube-bg-script-${this._uid}`
        tag.src = 'https://www.youtube.com/iframe_api'

        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)


        window.onYouTubeIframeAPIReady = this.onYouTubeIframeAPIReady
    },
    methods: {
        restartVideo () {
            this.player.seekTo(0)
            this.player.playVideo()
        },

        onPlayerEnd () {
            console.log('Video ended')

            this.restartVideo()
        },
        onPlayerPlaying () {
            console.log('Player playing')

            this.playing = true
        },
        onPlayerReady (event) {
            console.log('Player is ready', this.player)

            // Mute the player
            this.player.mute()

            this.player.playVideo()
        },
        onYouTubeIframeAPIReady () {
            // console.log('Youtube Embed API Ready')

            const stateHandlers = {
                // unstarted
                '-1': () => null,
                // ended
                '0': this.onPlayerEnd,
                // playing
                '1': this.onPlayerPlaying,
                // paused
                '2': () => null,
                // buffering
                '3': () => null,
                // video cued
                '4': () => null,
            }

            // console.log('YT', YT)

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
        }
    },
}
</script>

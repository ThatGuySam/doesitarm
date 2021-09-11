<template>
    <VideoPlayer
        v-if="youtubeId !== null"
        :video="video"
        class="w-100 h-100 absolute inset-0 flex justify-center items-center"
    >
        <template v-slot:cover-bottom>
            <div class="page-heading h-full flex items-end md:p-4">
                <h1 class="title text-xs text-left md:text-2xl font-bold">
                    {{ video.name }}
                </h1>
            </div>
        </template>
    </VideoPlayer>
</template>

<script>

import VideoPlayer from '~/components-nuxt/video/player.vue'

export default {
    layout: 'embed',

    components: {
        VideoPlayer
    },

    data: function () {
        return {
            youtubeId: null,
            name: ''
        }
    },

    computed: {
        video () {
            return {
                name: this.name,
                id: this.youtubeId,
                timestamps: [],
                thumbnail: {
                    sizes: '(max-width: 640px) 100vw, 640px',
                    srcset: `https://i.ytimg.com/vi/${this.youtubeId}/default.jpg 120w, https://i.ytimg.com/vi/${this.youtubeId}/mqdefault.jpg 320w, https://i.ytimg.com/vi/${this.youtubeId}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${this.youtubeId}/sddefault.jpg 640w`,
                    src: `https://i.ytimg.com/vi/${this.youtubeId}/default.jpg`
                },
            }
        }
    },

    head() {
        return {
            title: 'Video - Does It ARM',
            // meta: [
            //     // hid is used as unique identifier. Do not use `vmid` for it as it will not work
            //     {
            //         hid: 'description',
            //         name: 'description',
            //         content: 'My custom description'
            //     }
            // ]
        }
    },

    mounted () {
        // this.youtubeId = 'NDwmqJYJq9s'

        // console.log('window', window)

        if ( process.client ) {
            const urlParams = new URLSearchParams(window.location.search)

            this.youtubeId = urlParams.get('youtube-id')

            this.name = urlParams.get('name')
        }

        // console.log('this.youtubeId', this.youtubeId)
    }
}
</script>

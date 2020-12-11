<template>
    <section class="container py-16">
        <div class="flex flex-col items-center text-center space-y-6">
            <VideoPlayer
                :video="video"
            />

            <!-- <h1 class="title text-sm md:text-3xl font-semibold">
                {{ video.name }}
            </h1> -->

            <div class="related-videos w-full max-w-4xl">
                <!-- <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    {{ app.name }} Related Videos
                </h2> -->
                <VideoRow
                    :videos="relatedVideos"
                />
            </div>

            <!-- video: {{ video }} -->

            <!-- <div class="links space-y-6 sm:space-x-6 mb-8">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'View' : link.label }}</LinkButton>
            </div> -->

        </div>
    </section>
</template>

<script>
import LinkButton from '~/components/link-button.vue'
import EmailSubscribe from '~/components/email-subscribe.vue'
import VideoRow from '~/components/video/row.vue'
import VideoPlayer from '~/components/video/player.vue'

export default {
    components: {
        LinkButton,
        EmailSubscribe,
        VideoRow,
        VideoPlayer
    },
    async asyncData ({ params: { slug } }) {

        const { allVideoList } = await import('~/helpers/get-list.js')
        const { default: videoList } = await import('~/static/video-list.json')

        const app = allVideoList.find(app => (app.slug === slug))

        // const featuredApps = []

        const relatedVideos = []

        // Find other videos that also feature this video's app
        for (const video of videoList) {
            if (!video.apps.includes(app.slug)) continue

            relatedVideos.push(video)
        }

        return {
            app,
            relatedVideos: relatedVideos.map(video => {
                // console.log('video', video)
                return {
                    ...video,
                    endpoint: `#${video.id}`
                }
            })
        }
    },
    data: function () {
        return {
            activeVideoIndex: 0
        }
    },
    computed: {
        video () {
            return this.relatedVideos[this.activeVideoIndex]
        },
        title () {
            return `${this.app.name} Benchmarks for Apple Silicon - Does It ARM`
        },
        description () {
            return `Apple Silicon performance and support videos for ${this.app.name}`
        }
    },
    mounted () {
        window.onhashchange = this.loadVideoFromHash

    },
    methods: {
        loadVideoFromHash () {
            // console.log('location.hash', location.hash)

            // Separate the video id from our window hash
            const hashId = location.hash.split('#')[1]

            // Find the index of the video with the matching hash
            const newVideoIndex = this.relatedVideos.findIndex(video => {
                return video.id === hashId
            })

            // Load in the index to load out video
            this.activeVideoIndex = newVideoIndex
        }
    },
    head() {
        return {
            title: this.title,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': this.description
                },

                // Twitter Card
                {
                    'hid': 'twitter:title',
                    'property':  'twitter:title',
                    'content': this.title
                },
                {
                    'hid': 'twitter:description',
                    'property':  'twitter:description',
                    'content': this.description
                },
                {
                    'property':  'twitter:url',
                    'content': `${process.env.URL}${this.$nuxt.$route.path}`
                },
            ]
        }
    }
}
</script>

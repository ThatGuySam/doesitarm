<template>
    <section class="container py-16">
        <div class="flex flex-col items-center text-center space-y-8">
            <VideoPlayer
                :video="video"
            />

            <!-- <h1 class="title text-sm md:text-3xl font-semibold">
                {{ video.name }}
            </h1> -->

            <div class="related-videos w-full max-w-4xl">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Benchmark Videos
                </h2>
                <VideoRow
                    :videos="relatedVideos"
                    :active-video-id="video.id"
                />
            </div>

            <div class="related-videos w-full max-w-4xl">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Performance Videos
                </h2>
                <VideoRow
                    :videos="relatedVideos"
                    :active-video-id="video.id"
                />
            </div>

            <div class="related-videos w-full max-w-4xl">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    More Videos
                </h2>
                <VideoRow
                    :videos="relatedVideos"
                    :active-video-id="video.id"
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

        const { allVideoAppsList } = await import('~/helpers/get-list.js')
        // const { default: videoList } = await import('~/static/video-list.json')

        const { videosRelatedToApp } = await import('~/helpers/related.js')

        const app = allVideoAppsList.find(app => (app.slug === slug))

        // const featuredApps = []

        const relatedVideos = videosRelatedToApp( app )

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

        if (location.hash.length !== 0) this.loadVideoFromHash()
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

            window.scroll({ top: 0, behavior: 'smooth' })
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

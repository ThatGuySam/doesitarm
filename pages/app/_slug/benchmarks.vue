<template>
    <section class="container py-16">
        <div class="flex flex-col items-center text-center space-y-8">
            <template
                v-if="video"
            >
                <VideoPlayer
                    :video="video"
                />
                <ChannelCredit
                    :video="video"
                    class="flex w-full justify-start md:px-10"
                />
            </template>
            <template v-else>
                <div
                    :style="{
                        'left': '50%',
                        'right': '50%',
                        'margin-left': '-50vw',
                        'margin-right': '-50vw'
                    }"
                    class="video-canvas w-screen flex justify-center bg-black"
                >
                    <div class="ratio-wrapper w-full max-w-4xl">
                        <div class="relative overflow-hidden w-full pb-16/9">
                            <div class="absolute h-full w-full flex justify-center items-center">
                                <div class="message text-4xl md:text-6xl font-hairline leading-tight text-center">No videos yet</div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- <h1 class="title text-sm md:text-3xl font-semibold">
                {{ video.name }}
            </h1> -->

            <div class="related-videos w-full max-w-4xl">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Benchmark Videos
                </h2>
                <!-- <pre class="text-left">{{ benchmarkVideos }}</pre> -->
                <VideoRow
                    :videos="benchmarkVideos"
                    :active-video-id="activeVideoId"
                />
            </div>

            <div
                v-if="performanceVideos.length !== 0"
                class="performance-videos w-full max-w-4xl"
            >
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Performance Videos
                </h2>
                <!-- <pre class="text-left">{{ performanceVideos }}</pre> -->
                <VideoRow
                    :videos="performanceVideos"
                    :active-video-id="activeVideoId"
                />
            </div>

            <div
                v-if="moreVideos.length !== 0"
                class="related-videos w-full max-w-4xl"
            >
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    More Videos
                </h2>
                <!-- <pre class="text-left">{{ relatedVideos }}</pre> -->
                <VideoRow
                    :videos="moreVideos"
                    :active-video-id="activeVideoId"
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
import ChannelCredit from '~/components/video/channel-credit.vue'

export default {
    components: {
        LinkButton,
        EmailSubscribe,
        VideoRow,
        VideoPlayer,
        ChannelCredit
    },
    async asyncData ({ params: { slug } }) {

        const { allVideoAppsList } = await import('~/helpers/get-list.js')
        // const { default: videoList } = await import('~/static/video-list.json')

        const { videosRelatedToApp } = await import('~/helpers/related.js')

        const app = allVideoAppsList.find(app => (app.slug === slug))

        const submitVideoCard = {
            endpoint: `https://docs.google.com/forms/d/e/1FAIpQLSeEVGM9vE7VcfLMy6fJkfU70X2VZ60rHDyhDQLtnAN4nso0WA/viewform?usp=pp_url&entry.1018125313=${app.name}`
        }

        // const featuredApps = []

        const relatedVideos = videosRelatedToApp( app ).map(video => {
            // console.log('video', video)
            return {
                ...video,
                endpoint: `#${video.id}`
            }
        })

        return {
            app,
            allVideos: relatedVideos,
            submitVideoCard
        }
    },
    data: function () {
        return {
            activeVideoIndex: 0,
            benchmarkVideos: [],
            performanceVideos: [],
            moreVideos: [],
        }
    },
    computed: {
        video () {
            return this.allVideos[this.activeVideoIndex]
        },
        title () {
            return `${this.app.name} Benchmarks for Apple Silicon - Does It ARM`
        },
        description () {
            return `Apple Silicon benchmark, performance, and support videos for ${this.app.name}`
        },
        activeVideoId () {
            return (this.video === Object(this.video)) ? this.video.id : null
        }
    },
    created () {

        const nonBenchmarkVideos = []

        // console.log('benchmarkVideos.length', this.benchmarkVideos.length)
        // console.log('performanceVideos.length', this.performanceVideos.length)
        // console.log('moreVideos.length', this.moreVideos.length)

        // Move benchmark videos out of related videos
        this.allVideos.forEach((video, index) => {
            // console.log('video.name', video.name)
            // console.log('video.tags', video.tags)

            if (!video.tags.includes('benchmark')) {
                nonBenchmarkVideos.push(video)
                return
            }


            // Add to benchmark videos
            this.benchmarkVideos.push(video)
        })

        // console.log('Added benchmark videos')
        // console.log('benchmarkVideos.length', this.benchmarkVideos.length)
        // console.log('performanceVideos.length', this.performanceVideos.length)
        // console.log('moreVideos.length', this.moreVideos.length)

        // Move performance videos out of related videos
        nonBenchmarkVideos.forEach((video, index) => {

            if (!video.tags.includes('performance')) {
                this.moreVideos.push(video)
                return
            }

            // Add to benchmark videos
            this.performanceVideos.push(video)
        })

        // Append submit card to end
        this.benchmarkVideos.push(this.submitVideoCard)


        // console.log('Added performance videos')
        // console.log('benchmarkVideos.length', this.benchmarkVideos.length)
        // console.log('performanceVideos.length', this.performanceVideos.length)
        // console.log('moreVideos.length', this.moreVideos.length)
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
            const newVideoIndex = this.allVideos.findIndex(video => {
                return video.id === hashId
            })

            console.log('newVideoIndex', newVideoIndex)

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

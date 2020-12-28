<template>
    <section class="container pb-16">
        <div class="flex flex-col items-center text-center space-y-8">
            <template
                v-if="video"
            >
                <VideoPlayer
                    :video="video"
                    class="pt-16"
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
                    class="video-canvas w-screen flex justify-center bg-black pt-16"
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

            <div
                v-for="(row, key) in videoRows"
                :key="key"
                class="w-full max-w-4xl"
            >
                <div
                    v-if="row.videos.length !== 0"
                    :class="`${key}-videos w-full`"
                >
                    <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                        {{ row.heading }}
                    </h2>
                    <!-- <pre class="text-left">{{ benchmarkVideos }}</pre> -->
                    <VideoRow
                        :videos="row.videos"
                        :active-video-id="activeVideoId"
                    />
                </div>
            </div>

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

        // const submitVideoCard = {
        //     endpoint: `https://docs.google.com/forms/d/e/1FAIpQLSeEVGM9vE7VcfLMy6fJkfU70X2VZ60rHDyhDQLtnAN4nso0WA/viewform?usp=pp_url&entry.1018125313=${app.name}`
        // }

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
            // submitVideoCard
        }
    },
    data: function () {
        return {
            activeVideoIndex: 0,
            videoRows: {
                'benchmarks': {
                    heading: 'Benchmark Videos',
                    matchesCondition: video => video.tags.includes('benchmark'),
                    videos: []
                },
                'performance': {
                    heading: 'Performance Videos',
                    matchesCondition: video => video.tags.includes('performance'),
                    videos: []
                },

                'other': {
                    heading: 'More Videos',
                    // Always true
                    matchesCondition: () => true,
                    videos: []
                }
            }
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
            return `Apple Silicon gaming benchmark, performance, and support videos for ${this.app.name}`
        },
        activeVideoId () {
            return (this.video === Object(this.video)) ? this.video.id : null
        }
    },
    created () {

        // Move videos to relevant categories
        this.allVideos.forEach((video, index) => {
            // console.log('video.name', video.name)
            // console.log('video.tags', video.tags)

            // Look through row conditions to see if video matches
            for (const row in this.videoRows) {
                if( this.videoRows[row].matchesCondition(video) ) {

                    // Add the matching video
                    this.videoRows[row].videos.push(video)

                    return
                }
            }

        })

        console.log('lengths', Object.values(this.videoRows).map(row => [row.heading, row.videos.length]))

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

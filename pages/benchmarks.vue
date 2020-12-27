<template>
    <section class="container relative md:static overflow-hidden md:overflow-visible pb-16">
        <div class="flex flex-col items-center text-center space-y-12">
            <BgPlayer
                :video="video"
                class="absolute overflow-hidden w-2x-screen md:w-full"
            />

            <a
                :href="video.endpoint"
            >
                <div
                    class="relative flex flex-col w-full justify-center items-center space-y-8 py-16 md:py-32 md:px-10"
                >
                    <h2 class="title text-lg md:text-2xl font-semibold">
                        {{ video.name }}
                    </h2>
                    <div
                        class="play-circle w-16 h-16 bg-white-2 flex justify-center items-center outline-0 rounded-full ease"
                    >
                        <svg
                            viewBox="0 0 18 18"
                            style="width:24px;height:24px;margin-left:3px"
                        >
                            <path
                                fill="currentColor"
                                d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"
                            />
                        </svg>
                    </div>
                </div>
            </a>

            <hr class="w-full" >


            <div
                v-for="(row, key) in videoRows"
                :key="key"
                :class="`${key}-videos w-full max-w-4xl`"
            >
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    {{ row.heading }}
                </h2>
                <!-- <pre class="text-left">{{ benchmarkVideos }}</pre> -->
                <VideoRow
                    :videos="row.videos"
                />
            </div>

        </div>
    </section>
</template>

<script>

import { getVideoEndpoint } from '~/helpers/app-derived.js'

import LinkButton from '~/components/link-button.vue'
import EmailSubscribe from '~/components/email-subscribe.vue'
import VideoRow from '~/components/video/row.vue'
import BgPlayer from '~/components/video/bg-player.vue'
import ChannelCredit from '~/components/video/channel-credit.vue'

export default {
    components: {
        LinkButton,
        EmailSubscribe,
        VideoRow,
        BgPlayer,
        ChannelCredit
    },
    async asyncData ({ params: { slug } }) {

        // const { appsRelatedToVideo, videosRelatedToVideo } = await import('~/helpers/related.js')
        const { default: videoList } = await import('~/static/video-list.json')

        return {
            video: videoList[0],
            allVideos: videoList.map( video => {
                return {
                    ...video,
                    endpoint: getVideoEndpoint(video)
                }
            })
        }
    },
    data: function () {
        return {
            videoRows: {
                'video-benchmarks': {
                    heading: 'Video Editing Benchmarks',
                    matchesCondition: video => {
                        return video.tags.includes('benchmark') && video.tags.includes('video-and-motion-tools')
                    },
                    videos: []
                },
                'music-and-audio-tools': {
                    heading: 'Music and DAW Performance',
                    matchesCondition: video => {
                        return video.tags.includes('music-and-audio-tools')
                    },
                    videos: []
                },
                // 'science-and-research-software': {
                //     heading: 'Science and Research',
                //     matchesCondition: video => {
                //         return video.tags.includes('science-and-research-software')
                //     },
                //     videos: []
                // },
                'photo-and-graphic-tools': {
                    heading: 'Photography and Design Compatibility',
                    matchesCondition: video => {
                        return video.tags.includes('photo-and-graphic-tools')
                    },
                    videos: []
                },
                'games': {
                    heading: 'Gaming Benchmarks',
                    matchesCondition: video => {
                        return video.tags.includes('benchmark') && video.tags.includes('games')
                    },
                    videos: []
                },
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
        title () {
            return `Benchmarks for Apple M1 and Apple Silicon - Does It ARM`
        },
        description () {
            // const featuredAppsString = this.featuredApps.slice(0, 5).map(app => app.name).join(', ')

            return `Apple Silicon benchmark, performance, and compatibility videos`
        },
        activeVideoId () {
            return this.video.id
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

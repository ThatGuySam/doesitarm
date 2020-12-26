<template>
    <section class="container py-16">
        <div class="flex flex-col items-center text-center space-y-6">
            <VideoPlayer
                :video="video"
            />

            <h1 class="title text-sm md:text-3xl font-semibold">
                {{ video.name }}
            </h1>

            <div class="related-apps w-full">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Related Apps
                </h2>
                <div class="featured-apps overflow-x-auto overflow-y-visible whitespace-no-wrap py-2 space-x-2">
                    <LinkButton
                        v-for="app in featuredApps"
                        :key="app.slug"
                        :href="getAppEndpoint(app)"
                        :class="[
                            'inline-block text-xs rounded-lg py-1 px-2',
                        ]"
                        :class-groups="{
                            shadow: 'neumorphic-shadow-inner'
                        }"
                    >{{ app.name }}</LinkButton>
                </div>
            </div>

            <div class="related-videos w-full">
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Related Videos
                </h2>
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

import { getAppEndpoint } from '~/helpers/app-derived.js'

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

        const { appsRelatedToVideo, videosRelatedToVideo } = await import('~/helpers/related.js')
        const { default: videoList } = await import('~/static/video-list.json')

        // Find the video for our current page
        const video = videoList.find(video => (video.slug === slug))

        // Get featured apps
        const featuredApps = appsRelatedToVideo(video)

        // Get related videos
        const relatedVideos = videosRelatedToVideo(video)

        return {
            video,
            featuredApps,
            relatedVideos
        }
    },
    computed: {
        title () {
            return `${this.video.name} - Does It ARM`
        },
        description () {
            const featuredAppsString = this.featuredApps.slice(0, 5).map(app => app.name).join(', ')

            return `Apple Silicon performance and support videos for ${featuredAppsString}`
        }
    },
    methods: {
        getAppEndpoint
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

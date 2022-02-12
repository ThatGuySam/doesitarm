<template>
    <section class="container py-32">
        <div class="flex flex-col items-center text-center space-y-8">
            <div class="hero-heading space-y-6">
                <h1 class="title text-sm md:text-2xl font-bold">
                    Does {{ app.name }} work on Apple Silicon?
                </h1>
                <h2 class="subtitle text-2xl md:text-5xl font-bold">
                    {{ app.text }}
                </h2>
            </div>

            <div class="subscribe">
                <AllUpdatesSubscribe
                    :app-name="app.name"
                />
            </div>

            <div class="links space-y-6 sm:space-x-6">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'View' : link.label }}</LinkButton>
            </div>

            <div
                v-if="relatedVideos.length !== 0"
                class="related-videos w-full"
            >
                <h2 class="subtitle text-xl md:text-2xl font-bold mb-3">
                    Related Videos
                </h2>
                <VideoRow
                    :videos="relatedVideos"
                />
            </div>

            <div class="report-links py-24 text-xs shadow-none">
                <div v-if="app.lastUpdated">
                    <time
                        :datetime="app.lastUpdated.raw"
                    >
                        Last Updated {{ lastUpdatedFriendly }}
                    </time>
                </div>
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+is%3Aopen+${app.name}`"
                    target="_blank"
                    class="underline"
                    rel="noopener"
                >Report Update</a>
            </div>
        </div>
    </section>
</template>

<script>
import { makeLastUpdatedFriendly } from '~/helpers/parse-date'
import { getAppEndpoint } from '~/helpers/app-derived.js'

import LinkButton from '~/components/link-button.vue'
import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'
import VideoRow from '~/components/video/row.vue'

import appList from '~/static/app-list.json'
// import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        LinkButton,
        AllUpdatesSubscribe,
        VideoRow
    },
    async asyncData ({ params: { slug } }) {

        const { default: videoList } = await import('~/static/video-list.json')
        const { videosRelatedToApp } = await import('~/helpers/related.js')

        const app = appList.find(app => (app.slug === slug))

        const relatedVideos = videosRelatedToApp( app, (new Set(videoList)) )

        // Find other videos that also feature this video's app
        // for (const video of videoList) {
        //     if (!video.apps.includes(app.slug)) continue

        //     relatedVideos.push(video)
        // }

        return {
            slug,
            app,
            relatedVideos: relatedVideos.map(video => {
                // console.log('video', video)
                return {
                    ...video,
                    endpoint: `${getAppEndpoint(app)}/benchmarks#${video.id}`
                }
            })
        }
    },
    computed: {
        lastUpdatedFriendly () {
            return makeLastUpdatedFriendly( this.app.lastUpdated )
        }
    },
    head() {
        return {
            title: `Does ${this.app.name} work on Apple Silicon?`,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Pro and M1 Max Processors`
                },

                // Twitter Card
                {
                    'hid': 'twitter:title',
                    'property':  'twitter:title',
                    'content': `Does ${this.app.name} work on Apple Silicon?`
                },
                {
                    'hid': 'twitter:description',
                    'property':  'twitter:description',
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Pro and M1 Max Processors`
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

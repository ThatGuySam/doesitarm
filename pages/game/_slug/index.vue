<template>
    <section class="container py-32">
        <div class="flex flex-col items-center text-center">
            <h1 class="title text-sm md:text-2xl font-semibold">
                Does {{ app.name }} work on Apple Silicon?
            </h1>
            <h2 class="subtitle text-2xl md:text-5xl font-bold py-6">
                {{ app.text }}
            </h2>

            <ThomasCredit />


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

            <h2 class="subtitle text-xl md:text-2xl font-bold py-6">
                Reports
            </h2>

            <ul class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4 mb-4">

                <li
                    v-for="(report, i) in app.reports"
                    :key="`${app.slug}-${i}`"
                    class="col-span-1 rounded-lg border w-full md:w-64"
                >
                    <div class="w-full flex items-center justify-between p-6">
                        <div class="flex-1">
                            <div class="space-x-3">
                                <h3 class="text-sm leading-5 font-medium">{{ report['Specs'] }}</h3>
                                <span class="flex-shrink-0 inline-block px-2 py-0.5 text-teal-800 text-xs leading-4 font-medium bg-teal-100 rounded-full">{{ report['FPS'] }}</span>
                            </div>
                            <p class="mt-1 text-sm leading-5">{{ report['Notes'] }}</p>
                            <p
                                v-if="report['Resolution'].length !== 0"
                                class="mt-1 text-sm leading-5"
                            >
                                🖥 {{ report['Resolution'] }}
                            </p>
                            <p
                                v-if="report['Settings'].length !== 0"
                                class="mt-1 text-sm leading-5"
                            >
                                ⚙️ {{ report['Settings'] }}
                            </p>
                        </div>
                    </div>

                    <div
                        v-if="report['Source'].includes('https://')"
                        class="border-t border-gray-200"
                    >
                        <div class="-mt-px flex">
                            <div class="w-0 flex-1 flex border-r border-gray-200">
                                <a
                                    :href="report['Source']"
                                    class="relative -mr-px w-0 flex-1 inline-flex items-center justify-center py-4 text-sm leading-5 font-medium border border-transparent rounded-bl-lg hover:text-gray-500 focus:outline-none focus:shadow-outline-blue focus:border-blue-300 focus:z-10 transition ease-in-out duration-150"
                                >
                                    <!-- Heroicon name: mail -->
                                    <svg
                                        class="w-5 h-5"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                    </svg>
                                    <span class="ml-3 opacity-75">Source</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </li>

            </ul>

            <div class="report-links py-24 shadow-none">
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://forms.gle/29GWt85i1G1L7Ttj8`"
                    target="_blank"
                    class="text-xs"
                    rel="noopener"
                >Report Update</a>
            </div>
        </div>
    </section>
</template>

<script>
import { getAppEndpoint } from '~/helpers/app-derived.js'

import VideoRow from '~/components/video/row.vue'
import LinkButton from '~/components/link-button.vue'
import ThomasCredit from '~/components/thomas-credit.vue'

export default {
    components: {
        VideoRow,
        LinkButton,
        ThomasCredit
    },
    async asyncData ({ params: { slug } }) {

        const { default: gameList } = await import('~/static/game-list.json')
        const { default: videoList } = await import('~/static/video-list.json')
        const { videosRelatedToApp } = await import('~/helpers/related.js')

        const app = gameList.find(app => (app.slug === slug))

        const relatedVideos = videosRelatedToApp(app)

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
    head() {
        return {
            title: `Does ${this.app.name} work on Apple Silicon?`,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Processors for gaming. `
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
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Processors for gaming. `
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

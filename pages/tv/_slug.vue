<template>
    <section class="container pb-16">
        <div class="flex flex-col items-center text-center space-y-6">
            <VideoPlayer
                :video="video"
                class="pt-16"
            />

            <div
                class="md:flex w-full justify-between space-y-4 md:space-y-0 md:px-10"
            >
                <h1 class="title text-lg md:text-2xl font-bold">
                    {{ video.name }}
                </h1>

                <ChannelCredit
                    :video="video"
                />
            </div>

            <hr class="w-full" >


            <div
                v-if="featuredApps.length !== 0"
                class="related-apps w-full"
            >
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
import ChannelCredit from '~/components/video/channel-credit.vue'


function makeFeaturedAppsString ( featuredApps ) {
    return featuredApps.slice(0, 5).map(app => app.name).join(', ')
}


function buildVideoStructuredData ( video, featuredApps ) {
    // console.log('video', video)

    const thumbnailUrls = video.thumbnail.srcset.split(',').map( srcSetImage => {
        const [ imageUrl ] = srcSetImage.split(' ')

        return imageUrl
    })

    const featuredAppsString = makeFeaturedAppsString( featuredApps )

    return {
        "@context": "https://schema.org",
        // https://developers.google.com/search/docs/data-types/video
        // https://schema.org/VideoObject
        "@type": "VideoObject",
        "name": video.name,
        "description": `Includes the following apps: ${featuredAppsString}`,
        "thumbnailUrl": thumbnailUrls,
        // https://en.wikipedia.org/wiki/ISO_8601
        "uploadDate": video.lastUpdated.raw,
        // "duration": "PT1M54S", // Need to updaet Youtube API Request for this
        // "contentUrl": "https://www.example.com/video/123/file.mp4",
        // "embedUrl": "https://www.example.com/embed/123",
        // "interactionStatistic": {
        //     "@type": "InteractionCounter",
        //     "interactionType": { "@type": "http://schema.org/WatchAction" },
        //     "userInteractionCount": 5647018
        // },
        // "regionsAllowed": "US,NL"
    }
}
export default {
    components: {
        LinkButton,
        EmailSubscribe,
        VideoRow,
        VideoPlayer,
        ChannelCredit
    },
    async asyncData ( data ) {


        const {
            params: { slug },
            route
        } = data

        let {
            payload
        } = data



        // Manually get payload as fallback
        // Uncomment for dev
        // if ( payload === undefined ) {
        //     // Read back the JSON we just wrote to ensure it exists
        //     const { default: savedList } = await import('~/static/nuxt-endpoints.json')

        //     const endpoint = savedList.find( resource => {
        //         return resource.route === route.path
        //     } )

        //     payload = endpoint.payload
        // }

        // console.log({
        //     video,
        //     featuredApps,
        //     relatedVideos
        // })

        return {
            video: payload.video,
            featuredApps: payload.featuredApps,
            relatedVideos: payload.relatedVideos
        }
    },
    computed: {
        title () {
            return `${this.video.name} - Does It ARM`
        },
        description () {
            const featuredAppsString = makeFeaturedAppsString( this.featuredApps )

            return `Apple Silicon performance and support videos for ${featuredAppsString}`
        },

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
            ],

            __dangerouslyDisableSanitizers: ['script'],
            script: [{ innerHTML: JSON.stringify( buildVideoStructuredData( this.video, this.featuredApps ) ), type: 'application/ld+json' }]
        }
    }
}
</script>

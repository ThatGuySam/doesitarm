<template>

    <div class="video-card">
        <a
            :href="video.endpoint"
            class=""
        >
            <div class="video-card-container relative overflow-hidden bg-white">
                <div class="video-card-image ratio-wrapper">
                    <div class="relative overflow-hidden w-full pb-16/9">
                        <!-- <img
                            :srcset="thumbnailSrcset"
                            :sizes="thumbnailSizes"
                            :src="video.thumbnails.default.url"
                            :alt="video.name"
                            class="absolute h-full w-full object-cover"
                        > -->
                    </div>
                </div>
                <div
                    :style="{
                        '--gradient-from-color': 'rgba(0, 0, 0, 1)',
                        '--gradient-to-color': 'rgba(0, 0, 0, 0.7)'
                    }"
                    class="video-card-overlay absolute inset-0 flex justify-between items-start bg-gradient-to-tr from-black to-transparent p-4"
                >
                    <div class="plus-circle w-8 h-8 bg-white-2 flex justify-center items-center outline-0 rounded-full ease">
                        <svg
                            viewBox="0 0 24 24"
                            style="width:18px;height:18px;"
                        >
                            <path
                                fill="currentColor"
                                d="M11 11v-11h1v11h11v1h-11v11h-1v-11h-11v-1h11z"
                            />
                            <!-- Plus Icon: "M11 11v-11h1v11h11v1h-11v11h-1v-11h-11v-1h11z" -->
                        </svg>
                    </div>

                </div>

                <!-- Video Text Content -->
                <div class="video-card-content absolute inset-0 flex items-end py-4 px-6">
                    <div class="w-full text-sm text-left whitespace-normal">Submit Video</div>
                </div>
            </div>
        </a>
    </div>

</template>

<script>

import { getVideoEndpoint } from '~/helpers/app-derived.js'

export default {
    props: {
        video: {
            type: Object,
            required: true
        }
    },
    // computed: {},
    methods: {
        getVideoEndpoint
    }
}

</script>

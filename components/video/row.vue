<template>
    <div class="video-row relative w-full">
        <div
            ref="row"
            :style="{
                scrollSnapType: 'x mandatory'
            }"
            class="video-row-contents flex overflow-x-auto whitespace-no-wrap py-2 space-x-6"
        >
            <component
                v-for="video in videos"
                :is="cardType ( video )"
                :key="video.slug"
                :video="video"
                :style="{
                    maxWidth: `${cardWidth}px`,
                    flexBasis: `${cardWidth}px`,
                    scrollSnapAlign: 'start'
                }"
                :class="[
                    'w-full flex-shrink-0 flex-grow-0 border-2 border-transparent rounded-2xl overflow-hidden',
                    (activeVideoId === video.id) ? 'border-white' : null
                ]"
            />
        </div>

        <button
            :style="{
                top: '50%',
            }"
            class="absolute left-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 -translate-x-1/2 bg-darker rounded-full"
            @click="scrollRow(cardWidth * -1)"
        >
            <svg
                class="h-5 w-5 text-gray-400"
                viewBox="0 0 20 20"
                fill="currentColor"
                style="transform: scaleX(-1);"
            >
                <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>

        <button
            :style="{
                top: '50%',
            }"
            class="absolute right-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 translate-x-1/2 bg-darker rounded-full"
            @click="scrollRow(cardWidth)"
        >
            <svg
                class="h-5 w-5 text-gray-400"
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fill-rule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clip-rule="evenodd"
                />
            </svg>
        </button>
    </div>
</template>

<script>

import SubmitCard from '~/components/video/submit-card.vue'
import VideoCard from '~/components/video/card.vue'


export default {
    components: {
        SubmitCard,
        VideoCard
    },
    props: {
        videos: {
            type: Array,
            required: true
        },
        activeVideoId: {
            type: String,
            default: null
        },
        cardWidth: {
            type: Number,
            default: 325
        },
    },
    methods: {
        scrollRow ( pixels ) {
            this.$refs['row'].scrollBy({ left: pixels, behavior: 'smooth' })
        },
        isSubmitCard ( video ) {
            return video.endpoint.includes('https://docs.google.com/forms')
        },
        cardType ( video ) {
            if (this.isSubmitCard(video)) return SubmitCard

            return VideoCard
        }
    }
}
</script>

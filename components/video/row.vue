<template>
    <div class="video-row w-full">
        <div
            :style="{
                scrollSnapType: 'x mandatory'
            }"
            class="video-row-contents flex overflow-x-auto whitespace-no-wrap py-2 space-x-6"
        >
            <VideoCard
                v-for="video in videos"
                :key="video.slug"
                :video="video"
                :style="{
                    maxWidth: '350px',
                    flexBasis: '350px',
                    flexGrow: '0',
                    scrollSnapAlign: 'start'
                }"
                class="w-full flex-shrink-0 flex-grow-0"
            />
        </div>
    </div>
</template>

<script>

import VideoCard from '~/components/video/card.vue'


export default {
    components: {
        VideoCard
    },
    props: {
        videos: {
            type: Array,
            required: true
        }
    }
}
</script>

<template>

    <div class="video-card">
        <a
            :href="video.endpoint"
            class=""
        >
            <div class="video-card-container relative overflow-hidden bg-black">
                <div class="video-card-image ratio-wrapper">
                    <div class="relative overflow-hidden w-full pb-16/9">
                        <img
                            :srcset="thumbnailSrcset"
                            :sizes="thumbnailSizes"
                            :src="video.thumbnails.default.url"
                            :alt="video.name"
                            class="absolute h-full w-full object-cover"
                        >
                    </div>
                </div>
                <div
                    :style="{
                        '--gradient-from-color': 'rgba(0, 0, 0, 1)',
                        '--gradient-to-color': 'rgba(0, 0, 0, 0.7)'
                    }"
                    class="video-card-overlay absolute inset-0 flex justify-start items-start bg-gradient-to-tr from-black to-transparent p-4"
                >
                    <div class="play-circle w-8 h-8 bg-white-2 flex justify-center items-center outline-0 rounded-full ease">
                        <svg
                            viewBox="0 0 18 18"
                            style="width:18px;height:18px;margin-left:3px"
                        >
                            <path
                                fill="currentColor"
                                d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"
                            />
                        </svg>
                    </div>
                </div>
                <div class="video-card-content absolute inset-0 flex items-end py-4 px-6">
                    <div class="w-full text-sm text-left whitespace-normal">{{ video.name }}</div>
                </div>
            </div>
        </a>
    </div>

</template>

<script>

export default {
    props: {
        video: {
            type: Object,
            required: true
        }
    },
    computed: {
        thumbnailSizes () {
            let maxWidth = 0
            Object.entries(this.video.thumbnails).forEach(([thumbnailKey, thumbnail]) => {
                if (thumbnail.width > maxWidth) maxWidth = thumbnail.width
            })

            // example:
            // "(max-width: 640px) 100vw, 640px"
            return `(max-width: ${maxWidth}px) 100vw, ${maxWidth}px`
        },
        thumbnailSrcset () {
            // console.log('this.video', this.video)

            // example:
            // https://vumbnail.com/358629078.jpg 640w, https://vumbnail.com/358629078_large.jpg 640w, https://vumbnail.com/358629078_medium.jpg 200w, https://vumbnail.com/358629078_small.jpg 100w
            return Object.entries(this.video.thumbnails).map(([thumbnailKey, thumbnail]) => {
                // console.log('thumbnail', thumbnail)
                return `${thumbnail.url} ${thumbnail.width}w`
            }).join(', ')
        }
    }
}

</script>

<template>
    <div
        :style="{
            'left': '50%',
            'right': '50%',
            'margin-left': '-50vw',
            'margin-right': '-50vw'
        }"
        class="video-canvas w-screen flex justify-center bg-black"
    >
        <div class="ratio-wrapper w-full max-w-4xl">
            <div class="relative overflow-hidden w-full pb-16/9">
                <iframe
                    :src="`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&modestbranding=1&playsinline=1`"
                    class="absolute h-full w-full object-cover"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                />
            </div>
        </div>
    </div>
</template>

<script>

export default {
    // components: {
    //     VideoCard
    // },
    props: {
        video: {
            type: Object,
            required: true
        }
    }
}
</script>

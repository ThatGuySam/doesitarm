<template>
    <div
        v-if="video.channel.id !== myChannelId"
        class="channel-credit"
    >
        <LinkButton
            :href="`https://www.youtube.com/channel/${video.channel.id}`"

            target="_blank"
        >Subscribe to {{ video.channel.name }}</LinkButton>
    </div>
</template>

<script>

import LinkButton from '~/components-nuxt/link-button.vue'

export default {
    components: {
        LinkButton
    },
    props: {
        video: {
            type: Object,
            required: true
        }
    },
    data: function () {
        return {
            myChannelId: 'UCB3jOb5QVjX7lYecvyCoTqQ'
        }
    }
}
</script>

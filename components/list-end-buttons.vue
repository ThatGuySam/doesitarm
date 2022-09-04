<template>
    <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">
        <LinkButton
            v-for="(link, i) in links"
            :key="i"
            :href="link.href"
            class="text-xs"
            :label="link.label"
        />
    </div>
</template>

<script>

import LinkButton from './link-button.vue'

export default {
    components: {
        LinkButton,
    },
    props: {
        query: {
            type: String,
            required: true,
        },
    },
    computed: {
        links () {
            return [
                {
                    label: '🧪 Scan Apps',
                    href: '/apple-silicon-app-test/'
                },
                {
                    label: '🙋 Request an App with Github',
                    href: `https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${ this.query }`
                }
            ]
        }
    }
}

</script>

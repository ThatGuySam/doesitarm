<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-4xl md:text-6xl font-hairline leading-tight text-center">
                Does it ARM?
            </h1>
            <h2 class="subtitle md:text-xl font-light text-center">
                Apps that are reported to support Apple Silicon
            </h2>

            <Search
                @update:query="query = $event"
            />

            <LinkButton
                :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${this.query}`"
            >
                Request an App
            </LinkButton>
        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'

import appList from '~/assets/app-list.json'

export default {
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {
            query: ''
        }
    },
    computed: {
        appList() {
            return appList
        }
    }
}
</script>

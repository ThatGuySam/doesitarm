<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-6xl font-hairline text-center">
                Does it ARM?
            </h1>
            <h2 class="subtitle text-xl font-light text-center">
                Apps that are reported to support Apple Silicon
            </h2>

            <Search />
        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'

import appList from '~/assets/app-list.json'

export default {
    components: {
        Search
    },
    computed: {
        appList() {
            return appList
        }
    }
}
</script>

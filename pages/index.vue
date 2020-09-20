<template>
    <section class="container">
        <div class="flex flex-col items-center">
            <h1 class="title text-6xl font-bold text-center">
                Does it 🦾ARM?
            </h1>
            <h2 class="subtitle text-xl font-bold text-center">
                Apps that are reported to support Apple Silicon
            </h2>

            <Search />
            <div class="apps">
                <div
                    v-for="app in appList"
                    :key="app.slug"
                >
                    <a :href="`/app/${app.slug}`">
                        <div>
                            {{ app.name }}
                        </div>
                    </a>
                </div>
            </div>
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

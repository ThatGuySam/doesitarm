<template>
    <section class="container">
        <div class="flex flex-col items-center text-center">
            <h1 class="title text-6xl font-bold">
                Does it 🦾ARM?
            </h1>
            <h2 class="subtitle text-xl font-bold">
                Apps that are reported to support Apple Silicon
            </h2>
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
                <a
                    href="https://nuxtjs.org/"
                    target="_blank"
                    class="button--green">Documentation</a>
                <a
                    href="https://github.com/nuxt/nuxt.js"
                    target="_blank"
                    class="button--grey">GitHub</a>
            </div>
        </div>
    </section>
</template>

<script>
import Logo from '~/components/Logo.vue'

import appList from '~/assets/app-list.json'

export default {
    components: {
        Logo
    },
    computed: {
        appList() {
            return appList
        }
    }
}
</script>

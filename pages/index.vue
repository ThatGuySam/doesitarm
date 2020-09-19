<template>
    <Layout>
        <section class="container">
            <div>
                <logo/>
                <h1 class="title">
                    Does it ARM
                </h1>
                <h2 class="subtitle">
                    Apps that are reported to support ARM on macOS
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
    </Layout>
</template>

<script>
import Logo from '~/components/Logo.vue'
import Layout from '~/components/layout.vue'

import appList from '~/assets/app-list.json'

export default {
    components: {
        Logo,
        Layout
    },
    computed: {
        appList() {
            return appList
        }
    }
}
</script>

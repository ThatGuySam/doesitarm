<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center pb-4">
                {{ section.label }} that are reported to support Apple Silicon
            </h1>
            <h2
                v-if="supportedAppList.length !== 0"
                class="subtitle md:text-xl font-light text-center"
            >
                Supported apps include {{ supportedAppList.join(', ') }}.
            </h2>

            <Search
                :app-list="sectionAppList"
                :quick-buttons="[]"
            />

            <LinkButton
                href="https://github.com/ThatGuySam/doesitarm/issues"
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
    async asyncData ({ params: { slug } }) {

        return {
            slug,
            app: appList.find(app => (app.slug === slug))
        }
    },
    components: {
        Search,
        LinkButton
    },
    computed: {
        section () {
            return appList.find(app => {
                return app.section.slug === this.slug
            }).section
        },
        sectionAppList () {
            return appList.filter(app => {
                return app.section.slug === this.slug
            })
        },
        supportedAppList () {
            return this.sectionAppList.filter(app => {
                console.log('app.status', app.status)
                return app.status.includes('yes')
            }).map(app => app.name)
        },
    }
}
</script>

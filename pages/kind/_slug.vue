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
                @update:query="query = $event"
            />

            <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">
                <LinkButton
                    :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${query}`"
                    class="text-xs"
                >
                    Request an App with Github
                </LinkButton>

                <LinkButton
                    :href="`https://twitter.com/DoesItARM/status/1330027384041508865`"
                    class="text-xs"
                >
                    Request an App with Twitter
                </LinkButton>
            </div>

        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'

import appList from '~/app-list.json'

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
    data: function () {
        return {
            query: ''
        }
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
                return app.status.includes('yes')
            }).map(app => app.name)
        },
        title () {
            if (!this.section.label.includes('Tools')) return `List of ${this.section.label} Apps that work on Apple Silicon?`

            return `List of ${this.section.label} that work on Apple Silicon?`
        }
    },
    head() {
        return {
            title: this.title,
            // meta: [
            //     // hid is used as unique identifier. Do not use `vmid` for it as it will not work
            //     {
            //         hid: 'description',
            //         name: 'description',
            //         content: 'My custom description'
            //     }
            // ]
        }
    }
}
</script>

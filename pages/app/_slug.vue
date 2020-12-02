<template>
    <section class="container py-32">
        <div class="flex flex-col items-center text-center">
            <h1 class="title text-sm md:text-2xl font-semibold">
                Does {{ app.name }} work on Apple Silicon?
            </h1>
            <h2 class="subtitle text-2xl md:text-5xl font-bold py-6">
                {{ app.text }}
            </h2>

            <div class="subscribe space-y-6 sm:space-x-6 mb-4">
                <AllUpdatesSubscribe
                    :app-name="app.name"
                />
            </div>

            <div class="links space-y-6 sm:space-x-6">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'View' : link.label }}</LinkButton>
            </div>

            <div class="report-links py-24 text-xs shadow-none">
                <div v-if="app.lastUpdated">
                    <time
                        :datetime="app.lastUpdated.raw"
                    >
                        Last Updated {{ lastUpdatedFriendly }}
                    </time>
                </div>
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+is%3Aopen+${app.name}`"
                    target="_blank"
                    class="underline"
                    rel="noopener"
                >Report Update</a>
            </div>
        </div>
    </section>
</template>

<script>
import parseGithubDate from '~/helpers/parse-github-date'
import LinkButton from '~/components/link-button.vue'
import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'
import appList from '~/static/app-list.json'
// import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        LinkButton,
        AllUpdatesSubscribe
    },
    async asyncData ({ params: { slug } }) {

        return {
            slug,
            app: appList.find(app => (app.slug === slug))
        }
    },
    computed: {
        lastUpdatedFriendly () {

            if (this.app.lastUpdated === null) return

            const options = { month: "long", day: "numeric", year: "numeric" }
            const date = new Date(this.app.lastUpdated.raw)
            const americanDate = new Intl.DateTimeFormat("en-US", options).format(date)

            return americanDate
        }
    },
    head() {
        return {
            title: `Does ${this.app.name} work on Apple Silicon?`,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Processors`
                },

                // Twitter Card
                {
                    'hid': 'twitter:title',
                    'property':  'twitter:title',
                    'content': `Does ${this.app.name} work on Apple Silicon?`
                },
                {
                    'hid': 'twitter:description',
                    'property':  'twitter:description',
                    'content': `Check the the latest reported support status of ${this.app.name} on Apple Silicon and Apple M1 Processors`
                },
                {
                    'property':  'twitter:url',
                    'content': `${process.env.URL}${this.$nuxt.$route.path}`
                },
            ]
        }
    }
}
</script>

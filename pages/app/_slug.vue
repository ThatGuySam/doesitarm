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
                <EmailSubscribe
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

            <div class="report-links py-24 shadow-none">
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+is%3Aopen+${app.name}`"
                    target="_blank"
                    class="text-xs"
                    rel="noopener"
                >Report Update</a>
            </div>
        </div>
    </section>
</template>

<script>
import LinkButton from '~/components/link-button.vue'
import EmailSubscribe from '~/components/email-subscribe.vue'
import appList from '~/app-list.json'
// import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        LinkButton,
        EmailSubscribe
    },
    async asyncData ({ params: { slug } }) {

        return {
            slug,
            app: appList.find(app => (app.slug === slug))
        }
    },
    head() {
        return {
            title: `Does ${this.app.name} work on Apple Silicon?`,
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

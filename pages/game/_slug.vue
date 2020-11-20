<template>
    <section class="container py-32">
        <div class="flex flex-col items-center text-center">
            <h1 class="title text-sm md:text-2xl font-semibold">
                Does {{ app.name }} work on Apple Silicon?
            </h1>
            <h2 class="subtitle text-2xl md:text-5xl font-bold py-6">
                {{ app.text }}
            </h2>

            <!-- <div class="subscribe space-y-6 sm:space-x-6 mb-4">
                <EmailSubscribe
                    :app-name="app.name"
                />
            </div> -->

            <div class="links space-y-6 sm:space-x-6">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'View' : link.label }}</LinkButton>
            </div>

            <small class="test-sm opacity-75">
                <span>Data generously provided by </span>
                <span>
                    <a
                        href="https://twitter.com/__tosh"
                        class="font-bold"
                    >Thomas Schranz</a>
                </span>
                <span>via</span>
                <span>
                    <a
                        href="https://docs.google.com/spreadsheets/d/1er-NivvuIheDmIKBVRu3S_BzA_lZT5z3Z-CxQZ-uPVs/edit#gid=0"
                        class="font-bold"
                    >Games and Apps on Apple Silicon</a>
                </span>
            </small>

            <div class="report-links py-24 shadow-none">
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://docs.google.com/spreadsheets/d/1er-NivvuIheDmIKBVRu3S_BzA_lZT5z3Z-CxQZ-uPVs/edit#gid=0`"
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
import gameList from '~/game-list.json'
// import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        LinkButton,
        EmailSubscribe
    },
    async asyncData ({ params: { slug } }) {

        return {
            slug,
            app: gameList.find(app => (app.slug === slug))
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

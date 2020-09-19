<template>
    <section class="container">
        <div class="flex flex-col items-center">
            <h1 class="title text-2xl font-bold">
                Does {{ app.name }} work on Apple Silicon?
            </h1>
            <h2 class="subtitle text-6xl font-bold py-6">
                {{ app.text }}
            </h2>
            <div class="links">
                <LinkButton
                    :href="app.url"
                    target="_blank"
                    class=""
                >Download</LinkButton>
            </div>
        </div>
    </section>
</template>

<script>
import LinkButton from '~/components/link-button.vue'
import appList from '~/assets/app-list.json'
// import buildAppList from '~/helpers/build-app-list'

export default {
    components: {
        LinkButton
    },
    async asyncData ({ params: { slug } }) {

        return {
            slug
        }
    },
    computed: {
        app () {
            // console.log('context', this.slug)
            return appList.find(app => (app.slug === this.slug))
        }
    }
}
</script>

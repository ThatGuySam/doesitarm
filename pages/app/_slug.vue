<template>
    <section class="container">
        <div class="flex flex-col items-center text-center">
            <h1 class="title text-sm md:text-2xl font-semibold">
                Does {{ app.name }} work on Apple Silicon?
            </h1>
            <h2 class="subtitle text-2xl md:text-6xl font-bold py-6">
                {{ app.text }}
            </h2>
            <div class="links space-x-6">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'Download' : link.label }}</LinkButton>
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

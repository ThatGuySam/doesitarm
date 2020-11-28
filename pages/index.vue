<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-4xl md:text-6xl font-hairline leading-tight text-center">
                Does it ARM?
            </h1>
            <h2 class="subtitle md:text-xl font-light text-center">
                Apps that are reported to support Apple Silicon
            </h2>

            <Search
                :app-list="allList"
                :initial-limit="200"
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

export default {
    async asyncData () {
        // const { default: appList } = await import('~/static/app-list.json')
        // const { default: gamelist } = await import('~/static/game-list.json')

        const { allList } = await import('~/helpers/get-list.js')

        return {
            allList
        }
    },
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {
            query: '',
        }
    }
}
</script>

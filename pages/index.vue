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
                :app-list="appList"
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

import { byTimeThenNull } from '~/helpers/sort-list.js'

import appList from '~/static/app-list.json'
import gameList from '~/game-list.json'

// console.log('appList.length', appList.length)
// console.log('gameList.length', gameList.length)

const sortedAppList = appList.sort(byTimeThenNull)

const mergedList = [
    ...sortedAppList,
    ...gameList
]

export default {
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {
            query: '',
        }
    },
    computed: {
        appList() {
            return mergedList
        }
    }
}
</script>

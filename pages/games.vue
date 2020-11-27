<template>
    <section class="container py-24">
        <div class="flex flex-col items-center">
            <h1 class="title text-4xl md:text-6xl font-hairline leading-tight text-center">
                Does it ARM?
            </h1>
            <h2 class="subtitle md:text-xl font-light text-center">
                Games that are reported to support Apple Silicon
            </h2>

            <ThomasCredit />

            <Search
                :app-list="gameList"
                :quick-buttons="quickButtons"
                no-email-subscribe
                @update:query="query = $event"
            />

            <LinkButton
                :href="`https://forms.gle/29GWt85i1G1L7Ttj8`"
            >
                Report a Game
            </LinkButton>
        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'
import ThomasCredit from '~/components/thomas-credit.vue'

import gameList from '~/static/game-list.json'

export default {
    components: {
        Search,
        LinkButton,
        ThomasCredit
    },
    data: function () {
        return {
            query: '',
            quickButtons: [
                {
                    label: '✅ Full Native Support',
                    query: 'status:native'
                },
                {
                    label: '✳️ Rosetta',
                    query: 'status:rosetta'
                },
                {
                    label: '🚫 Unsupported',
                    query: 'status:no'
                }
            ]
        }
    },
    computed: {
        gameList() {
            return gameList
        }
    },
    head() {
        return {
            title: `Games supported on Apple Silicon - Does it ARM`,
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

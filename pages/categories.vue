<template>
    <section class="container py-24">
        <div class="flex flex-col">
            <h1 class="title text-2xl leading-tight mb-6">
                Categories
            </h1>

            <div class="line-separator border-white border-t-2 mb-12" />

            <ul class="categories-list space-y-3">
                <li
                    v-for="(section, i) in sectionList"
                    :key="`${section.slug}-${i}`"
                    :ref="`${section.slug}-row`"
                    class="relative"
                >
                    <!-- section.endpoint: {{ section.endpoint }} -->
                    <a
                        :href="`/kind/${section.slug}`"
                        class="flex justify-start items-center inset-x-0 text-3xl md:text-4xl hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-x-2 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-6"
                        style="transition-property: border;"
                    >
                        <div class="font-hairline">
                            <div>{{ section.label }}</div>
                            <div>{{ section.label }}</div>
                        </div>
                        <div>➔</div>
                    </a>

                </li>
            </ul>

        </div>
    </section>
</template>

<script>
import Search from '~/components/search.vue'
import LinkButton from '~/components/link-button.vue'

import { byTimeThenNull } from '~/helpers/sort-list.js'

import appList from '~/static/app-list.json'
import gamelist from '~/static/game-list.json'

export default {
    async asyncData () {

        // const { default: appList } = await import('~/static/app-list.json')
        // const { default: gamelist } = await import('~/static/game-list.json')

        const allList = [
            ...appList.sort(byTimeThenNull),
            ...gamelist,
        ]

        const sectionList = {}

        allList.forEach( app => {
            // Find and store all sections

            // console.log('app.section.slug', app.section.slug)

            if (sectionList.hasOwnProperty(app.section.slug)) return

            sectionList[app.section.slug] = app.section
        })

        return {
            sectionList
        }
    },
    components: {
        Search,
        LinkButton
    },
    data: function () {
        return {}
    },
    // computed: {
    //     sectionList () {
    //         return sectionList
    //     }
    // },
    head() {
        return {
            title: `Categories of App Support for Apple Silicon - Does It ARM`,
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

<template>
    <section class="container py-24">
        <div class="flex flex-col">
            <h1 class="title text-2xl leading-tight mb-6">
                Categories
            </h1>

            <div class="line-separator border-white border-t-2 mb-12" />

            <!-- categoryList: {{ categoryList }} -->

            <ul class="categories-list space-y-3">
                <li
                    v-for="(category, i) in categoryList"
                    :key="`${category.slug}-${i}`"
                    :ref="`${category.slug}-row`"
                    class="relative"
                >
                    <!-- category.endpoint: {{ category.endpoint }} -->
                    <a
                        :href="`/kind/${category.slug}`"
                        class="flex justify-start items-center inset-x-0 text-3xl md:text-4xl hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-x-3 -mx-5 px-5 md:pr-64 py-3"
                        style="transition-property: border;"
                    >
                        <div class="font-hairline">
                            <div>{{ category.label }}</div>
                            <div class="text-xs opacity-75 mb-3">{{ category.appNames }}</div>
                        </div>
                        <div>➔</div>
                    </a>

                </li>
            </ul>

        </div>
    </section>
</template>

<script>
import Search from '~/components-nuxt/search.vue'
import LinkButton from '~/components-nuxt/link-button.vue'

// import appList from '~/static/app-list.json'
// import gamelist from '~/static/game-list.json'

export default {
    async asyncData () {

        // const { default: appList } = await import('~/static/app-list.json')
        // const { default: gamelist } = await import('~/static/game-list.json')

        const { allList } = await import('~/helpers/get-list.js')
        const { categories } = await import('~/helpers/categories.js')

        // Map Categories into category list
        const categoryList = Object.fromEntries(Object.entries(categories).map( ( entry ) => {
            entry[1].appNamesList = []
            return entry
        } ))

        // Delete no-category
        delete categoryList['no-category']

        allList.forEach( app => {
            // Find and store all categories

            // console.log('app.category.slug', app.category.slug)

            if (categoryList.hasOwnProperty(app.category.slug)) {
                categoryList[app.category.slug].appNamesList.push(app.name)

                return
            }

            categoryList[app.category.slug] = {
                // Merg in category data from app
                ...app.category,
                // Merge in category data from category file
                ...categories[app.category.slug],
                appNamesList: [ app.name ]
            }
        })

        // Add App Names Text into categoryList
        Object.keys(categoryList).map(function(key, index) {
            const category = categoryList[key]

            categoryList[key] = {
                ...category,
                appNames: category.appNamesList.slice(0, 25).join(', ') + ', etc...'
            }
        })

        // console.log('categoryList', categoryList)

        return {
            categoryList
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
    //     categoryList () {
    //         return categoryList
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

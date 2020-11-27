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

            <small class="text-sm data-credit opacity-75 text-center mb-4">
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
                        href="https://twitter.com/__tosh/status/1329099180476928002"
                        class="font-bold"
                    >Games and Apps on Apple Silicon</a>
                </span>
            </small>

            <div class="links space-y-6 sm:space-x-6 mb-8">
                <LinkButton
                    v-for="(link, i) in app.relatedLinks"
                    :key="i"
                    :href="link.href"
                    target="_blank"
                    class=""
                >{{ (i === 0) ? 'View' : link.label }}</LinkButton>
            </div>

            <h2 class="subtitle text-xl md:text-2xl font-bold py-6">
                Reports
            </h2>

            <ul class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">

                <li
                    v-for="(report, i) in app.reports"
                    :key="`${app.slug}-${i}`"
                    class="col-span-1 rounded-lg border w-full md:w-64"
                >
                    <div class="w-full flex items-center justify-between p-6">
                        <div class="flex-1">
                            <div class="space-x-3">
                                <h3 class="text-sm leading-5 font-medium">{{ report['Specs'] }}</h3>
                                <span class="flex-shrink-0 inline-block px-2 py-0.5 text-teal-800 text-xs leading-4 font-medium bg-teal-100 rounded-full">{{ report['FPS'] }}</span>
                            </div>
                            <p class="mt-1 text-sm leading-5">{{ report['Notes'] }}</p>
                            <p
                                v-if="report['Resolution'].length !== 0"
                                class="mt-1 text-sm leading-5"
                            >
                                🖥 {{ report['Resolution'] }}
                            </p>
                            <p
                                v-if="report['Settings'].length !== 0"
                                class="mt-1 text-sm leading-5"
                            >
                                ⚙️ {{ report['Settings'] }}
                            </p>
                        </div>
                    </div>
                    <div
                        v-if="report['Source'].length !== 0"
                        class="border-t border-gray-200"
                    >
                        <div class="-mt-px flex">
                            <div class="w-0 flex-1 flex border-r border-gray-200">
                                <a
                                    :href="report['Source']"
                                    class="relative -mr-px w-0 flex-1 inline-flex items-center justify-center py-4 text-sm leading-5 font-medium border border-transparent rounded-bl-lg hover:text-gray-500 focus:outline-none focus:shadow-outline-blue focus:border-blue-300 focus:z-10 transition ease-in-out duration-150"
                                >
                                    <!-- Heroicon name: mail -->
                                    <svg
                                        class="w-5 h-5"
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 20 20"
                                        fill="currentColor"
                                    >
                                        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                                    </svg>
                                    <span class="ml-3 opacity-75">Source</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </li>

            </ul>

            <div class="report-links py-24 shadow-none">
                <!-- https://eric.blog/2016/01/08/prefilling-github-issues/ -->
                <a
                    :href="`https://twitter.com/__tosh/status/1329099180476928002`"
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
import gameList from '~/static/game-list.json'
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

<template>

    <nav
        :class="[
            'fixed top-0 left-0 right-0 z-navbar',
            isOpen ? 'bg-blur' : ''
        ]"
    >
        <div class="max-w-7xl mx-auto px-4 lg:px-6">
            <div class="flex justify-between h-16">
                <div class="flex">
                    <div class="-ml-2 mr-2 flex items-center lg:hidden">
                        <!-- Mobile menu button -->
                        <button
                            :aria-expanded="isOpen ? 'true' : 'false'"
                            class="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:bg-gray-700 focus:text-white transition duration-150 ease-in-out"
                            aria-label="Main menu"
                            @click="isOpen = !isOpen"
                        >
                            <!-- Icon when menu is closed. -->
                            <svg
                                v-if="!isOpen"
                                class="h-6 w-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor">
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                            <!-- Icon when menu is open. -->
                            <svg
                                v-if="isOpen"
                                class="h-6 w-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor">
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div class="flex-shrink-0 flex items-center text-4xl lg:text-5xl py-3">
                        <div>🦾</div>
                    </div>
                    <div class="hidden lg:ml-6 lg:flex lg:items-center space-x-4">
                        <a
                            v-for="(item, index) in items"
                            :key="index"
                            :href="item.url"
                            :class="[
                                'px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                ($nuxt.$route.path === item.url) ? 'text-white bg-darker hover:text-white neumorphic-shadow' : 'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                            ]"
                        >
                            {{ item.label }}
                        </a>
                    </div>
                </div>

                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <!-- <span class="rounded-md shadow-sm">
                            <LinkButton
                                href="https://github.com/ThatGuySam/doesitarm/issues"
                                class="relative inline-flex items-center border-indigo-500"
                            >
                                <svg
                                    class="-ml-1 mr-2 h-5 w-5"
                                    viewBox="0 0 20 20"
                                    fill="currentColor">
                                    <path
                                        fill-rule="evenodd"
                                        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                        clip-rule="evenodd" />
                                </svg>
                                <span>Submit App</span>
                            </LinkButton>

                        </span> -->

                        <a
                            href="https://www.producthunt.com/posts/apple-silicon-app-test?utm_source=badge-featured&utm_medium=badge&utm_souce=badge-apple-silicon-app-test"
                            rel="noopener"
                            target="_blank"
                        >
                            <img
                                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=285320&theme=light"
                                alt="Apple Silicon App Test - Test your apps for compatibility before you buy an M1 Mac | Product Hunt"
                                style="width: 200px; height: 43px;"
                                width="200"
                                height="43"
                            >
                        </a>
                    </div>
                </div>

            </div>
        </div>
        <!--
            Mobile menu, toggle classes based on menu state.

            Menu open: "block", Menu closed: "hidden"
        -->
        <div
            :class="[
                'lg:hidden',
                isOpen ? 'block' : 'hidden'
            ]"
        >
            <div class="px-2 pt-2 pb-3 lg:px-3">
                <a
                    v-for="(item, index) in items"
                    :key="index"
                    :href="item.url"
                    :class="[
                        'mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                        ($nuxt.$route.path === item.url) ? 'text-white bg-gray-900 hover:text-white' : 'text-gray-300 hover:bg-gray-700'
                    ]"
                >
                    {{ item.label }}
                </a>
            </div>
            <hr>
        </div>
    </nav>

</template>

<script>
import LinkButton from '~/components/link-button.vue'

export default {
    components: {
        LinkButton
    },
    props: {
        items: {
            type: Array,
            default: () => ([
                {
                    label: 'Home',
                    url: '/',
                },
                {
                    label: 'Categories',
                    url: '/categories',
                },
                {
                    label: 'Benchmarks',
                    url: '/benchmarks',
                },
                {
                    label: 'Homebrew',
                    url: '/kind/homebrew',
                },
                {
                    label: 'Games',
                    url: '/games',
                },
                {
                    label: 'Apple Silicon App Test',
                    url: '/apple-silicon-app-test',
                },
            ])
        }
    },
    data: function () {
        return {
            isOpen: false
        }
    }
}
</script>

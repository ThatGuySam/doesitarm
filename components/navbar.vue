<template>

    <nav
        :class="[
            'fixed top-0 left-0 right-0 flex z-navbar',
            'bg-gradient-to-bl from-dark to-darker bg-fixed'
        ]"
    >
        <div class="mobile-menu-container flex items-center lg:hidden p-2">

            <!-- Mobile menu button -->
            <a
                :class="[
                    'mobile-menu-toggle rounded-md p-2',
                    'inline-flex items-center justify-center',
                    'text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:bg-gray-700 focus:text-white',
                    'transition duration-150 ease-in-out'
                ]"
                href="#mobile-menu"
                aria-label="Main menu"
            >
                <!-- Icon when menu is closed. -->
                <svg
                    class="parent-focus:hidden h-6 w-6"
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
                    class="hidden parent-focus:visible h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12" />
                </svg>

            </a>

        </div>


        <div
            id="mobile-menu"
            :class="[
                'mobile-menu hidden target:visible lg:hidden absolute bg-blur top-0 left-0 right-0 w-full py-3 px-2',
            ]"
        >
            <!-- Mobile menu button -->
            <a
                :class="[
                    'mobile-menu-close rounded-md p-2',
                    'inline-flex items-center justify-center',
                    'text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:bg-gray-700 focus:text-white',
                    'transition duration-150 ease-in-out'
                ]"
                href="#"
                aria-label="Main menu"
            >
                <!-- Icon when menu is open. -->
                <svg
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
            </a>

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

        <div class="reponsive-menu-container relative w-full max-w-7xl mx-auto lg:px-6">
            <div class="flex justify-between h-16">
                <div class="flex">
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
                                href="https://prf.hn/l/7JG0bEj"
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
                                <span>Parallels is now Apple Silicon native!</span>
                            </LinkButton>

                        </span> -->

                        <a
                            :class="[
                                'underline px-3 py-2 rounded-md text-xs font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                //($nuxt.$route.path === item.url) ? 'text-white bg-darker hover:text-white neumorphic-shadow' : 'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                            ]"
                            href="https://prf.hn/l/7JG0bEj"
                        >
                            🅿️ Windows on ARM now works on Parallels
                        </a>
                    </div>
                </div>

            </div>
        </div>
        <!--
            Mobile menu, toggle classes based on menu state.

            Menu open: "block", Menu closed: "hidden"
        -->
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
                    label: 'Devices',
                    url: '/devices',
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
    // data: function () {
    //     return {
    //         // isOpen: false
    //     }
    // }
}
</script>

<template>

    <nav
        :class="[
            'fixed top-0 left-0 right-0 flex z-navbar',
            'bg-gradient-to-bl from-dark to-darker bg-fixed',
            'justify-center items-center items-baseline'
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
                'mobile-menu hidden target:visible lg:hidden absolute bg-blur top-0 left-0 right-0 w-full py-3 px-2 pr-0',
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

            <div class="px-2 pt-2 pb-3 lg:px-3 md:pt-5">
                <a
                    href="/"
                    class="mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-gray-300 hover:bg-gray-700"
                >
                    🦾 Home
                </a>
                <a
                    v-for="(item, index) in items"
                    :key="index"
                    :href="item.url"
                    :class="[
                        'mt-1 block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                        (currentPath === item.url) ? 'text-white bg-gray-900 hover:text-white' : 'text-gray-300 hover:bg-gray-700'
                    ]"
                >
                    {{ item.emoji }}
                    {{ item.label }}
                </a>
            </div>
            <hr>
        </div>

        <div class="reponsive-menu-container relative w-full max-w-7xl ml-0 mb-1 mt-1 lg:mx-2 md:mr-2 md:mt-2">
            <div class="flex justify-between">
                <!-- responsive logo -->
                <div class="flex-shrink-0 flex items-center">
                    <a
                        href="/"
                        class="group h-full w-full lg:w-[110px] lg:h-[80px] lg:hover:bg-darker hover:neumorphic-shadow-logo lg:px-3 py-2 lg:rounded-md focus:outline-none lg:focus:text-white lg:focus:bg-gray-700 lg:leading-tight lg:transition lg:duration-150 lg:ease-in-out text-center whitespace-nowrap"
                    >
                        <div
                            class="lg:text-5xl text-3xl md:text-4xl lg:group-hover:text-xl"
                        >
                            🦾
                        </div>
                        <div
                            class="hidden lg:group-hover:block text-gray-300 text-sm font-medium leading-4"
                        >
                            Home
                        </div>
                    </a>
                </div>

                <!-- nav items desktop view -->
                <div class="hidden lg:flex lg:items-center grow justify-evenly">
                    <a
                        v-for="(item, index) in items"
                        :key="index"
                        :href="item.url"
                        :class="[
                            'px-3 py-2 rounded-md text-sm font-medium focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out text-center leading-tight whitespace-nowrap',(currentPath === item.url) ? 'text-white bg-darker hover:text-white neumorphic-shadow' : 'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                        ]"
                    >
                        <div class="text-xl">
                            {{ item.emoji }}
                        </div>
                        <div>
                            {{ item.label }}
                        </div>
                    </a>
                </div>

                <!-- advertisement -->
                <div class="flex shrink items-center">
                    <!-- <span class="rounded-md shadow-sm">
                            <LinkButton
                                href="https://prf.hn/l/daWX1vk"
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
                            'underline px-3 py-2 rounded-md text-xs font-medium focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out bg-black ml-4 m-1',
                        ]"
                        href="https://prf.hn/l/daWX1vk"
                    >
                        🅿️ Windows on ARM now works on Parallels
                    </a>
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
// https://anguscroll.com/just/just-has
import has from 'just-has'

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
                    emoji: '🤖',
                    label: 'Categories',
                    url: '/categories',
                },
                {
                    emoji: '💻',
                    label: 'Devices',
                    url: '/devices',
                },
                {
                    emoji: '🚀',
                    label: 'Benchmarks',
                    url: '/benchmarks',
                },
                {
                    emoji: '🍺',
                    label: 'Homebrew',
                    url: '/kind/homebrew',
                },
                {
                    emoji: '🎮',
                    label: 'Games',
                    url: '/games',
                },
                {
                    emoji: '🧪',
                    label: 'App Test',
                    url: '/apple-silicon-app-test',
                },
            ])
        }
    },
    computed: {
        currentPath () {
            // If we have a nuxt context, use that.
            if ( has( this, [ '$nuxt' ]) ) {
                return this.$nuxt.$route.path
            }

            // If we have a location object, use that.
            if ( typeof window !== 'undefined' && typeof window.location === 'object' ) {
                return window.location.pathname
            }

            return ''
        }
    }
    // data: function () {
    //     return {
    //         // isOpen: false
    //     }
    // }
}
</script>

<template>

    <nav class="bg-gray-800">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex">
                    <div class="-ml-2 mr-2 flex items-center md:hidden">
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
                    <div class="flex-shrink-0 flex items-center text-4xl md:text-5xl py-3">
                        <div>🦾</div>
                    </div>
                    <div class="hidden md:ml-6 md:flex md:items-center">
                        <a
                            v-for="(item, index) in items"
                            :key="index"
                            :href="item.url"
                            :class="[
                                'px-3 py-2 rounded-md text-sm font-medium leading-5 focus:outline-none focus:text-white focus:bg-gray-700 transition duration-150 ease-in-out',
                                ($nuxt.$route.path === item.url) ? 'text-white bg-gray-900 hover:text-white' : 'text-gray-300 hover:bg-darker hover:neumorphic-shadow'
                            ]"
                        >
                            {{ item.label }}
                        </a>
                    </div>
                </div>
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <span class="rounded-md shadow-sm">
                            <a
                                role="button"
                                href="https://github.com/ThatGuySam/doesitarm/issues"
                                class="relative inline-flex items-center px-4 py-2 border border-transparent text-sm leading-5 font-medium rounded-md text-white bg-indigo-500 hover:bg-indigo-400 focus:outline-none focus:shadow-outline-indigo focus:border-indigo-600 active:bg-indigo-600 transition duration-150 ease-in-out">
                                <!-- Heroicon name: plus -->
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
                            </a>
                        </span>
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
                'md:hidden',
                isOpen ? 'block' : 'hidden'
            ]"
        >
            <div class="px-2 pt-2 pb-3 sm:px-3">
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

export default {
    props: {
        items: {
            type: Array,
            default: () => ([
                {
                    label: 'Home',
                    url: '/',
                },
                // {
                //     label: 'Categories',
                //     url: '/categories',
                // },
                // {
                //     label: 'Contact',
                //     url: '/contact',
                // },
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

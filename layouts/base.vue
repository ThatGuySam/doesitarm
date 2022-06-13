<template>
    <div class="app-wrapper text-gray-300 bg-gradient-to-bl from-dark to-darker bg-fixed">
        <Navbar />
        <div class="app-main min-h-screen flex items-center">
            <slot />
        </div>

        <footer class="">
            <div class="max-w-screen-xl mx-auto py-12 px-4 overflow-hidden space-y-24 sm:px-6 lg:px-8">
                <!-- <nav class="-mx-5 -my-2 flex flex-wrap justify-center">
                    <div class="px-5 py-2">
                        <a href="#" class="text-base leading-6 text-gray-500 hover:text-gray-900">
                            About
                        </a>
                    </div>
                    <div class="px-5 py-2">
                        <a href="#" class="text-base leading-6 text-gray-500 hover:text-gray-900">
                            Blog
                        </a>
                    </div>
                </nav> -->
                <div class="flex justify-center space-x-6">
                    <div class="flex flex-col items-center space-y-4">
                        <AllUpdatesSubscribe />
                    </div>
                </div>
                <p class="text-center text-base leading-6 text-gray-400">
                    <span>Built by </span>
                    <a
                        href="https://samcarlton.com/"
                        rel="noopener"
                        class="underline"
                    >Sam Carlton</a>
                    <span> and the awesome </span>
                    <a
                        href="https://github.com/ThatGuySam/doesitarm/graphs/contributors"
                        rel="noopener"
                        class="underline"
                    >🦾 Does It ARM Contributors. </a>
                </p>
                <p class="mt-8 text-center text-base leading-6 text-gray-400">
                    &copy; {{ currentYear }} Does It ARM All rights reserved. This site is supported by Affiliate links.
                </p>
            </div>
        </footer>

    </div>
</template>

<script>

// import '@fontsource/inter/latin-100.css'
// import '@fontsource/inter/latin-400.css'
// import '@fontsource/inter/latin-700.css'

import '@fontsource/inter/variable.css'

import Navbar from '~/components/navbar.vue'
// import TwitterFollow from '~/components/twitter-follow.vue'
import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'

export default {
    components: {
        Navbar,
        AllUpdatesSubscribe
    },
    computed: {
        currentYear () {
            return new Date().getFullYear()
        }
    }
}

</script>

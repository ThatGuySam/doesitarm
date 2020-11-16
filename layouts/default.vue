<template>
    <div class="app-wrapper text-gray-300 bg-gradient-to-bl from-dark to-darker bg-fixed">
        <Navbar />
        <div class="app-main min-h-screen flex items-center">
            <nuxt />
        </div>

        <footer class="">
            <div class="max-w-screen-xl mx-auto py-12 px-4 overflow-hidden space-y-8 sm:px-6 lg:px-8">
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
                <div class="mt-8 flex justify-center space-x-6">
                    <div class="flex flex-col items-center space-y-4">
                        <div>Get Twitter Updates</div>
                        <TwitterFollow />
                    </div>
                </div>
                <p class="mt-8 text-center text-base leading-6 text-gray-400">
                    &copy; 2020 Does it ARM All rights reserved.
                </p>
            </div>
        </footer>

    </div>
</template>

<script>
import 'typeface-inter/inter.css'

import Navbar from '~/components/navbar.vue'
import TwitterFollow from '~/components/twitter-follow.vue'

export default {
    components: {
        Navbar,
        TwitterFollow
    }
}

</script>

<style>
html {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont,
        'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 20px;
    word-spacing: 1px;
    -ms-text-size-adjust: 100%;
    -webkit-text-size-adjust: 100%;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    box-sizing: border-box;

    background: #191a1d;
}

*,
*:before,
*:after {
    box-sizing: border-box;
    margin: 0;
}

</style>

<template>
    <div class="app-wrapper text-gray-300 bg-gray-800">
        <Navbar />
        <div class="app-main min-h-screen flex items-center">
            <nuxt />
        </div>
    </div>
</template>

<script>
import 'typeface-inter/inter.css'

import Navbar from '~/components/navbar.vue'

export default {
    components: {
        Navbar
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
}

*,
*:before,
*:after {
    box-sizing: border-box;
    margin: 0;
}

</style>

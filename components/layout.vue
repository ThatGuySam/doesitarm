<template>
    <div class="app-wrapper text-gray-300 bg-gray-800">
        <Navbar />
        <div class="app-main min-h-screen flex items-center">
            <slot />
        </div>
    </div>
</template>

<script>
import Navbar from '~/components/navbar.vue'

export default {
    components: {
        Navbar
    }
}
</script>

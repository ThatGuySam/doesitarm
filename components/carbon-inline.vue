<template>
    <div class="doesitarm-carbon-wrapper">
        <component
            v-once
            id="_carbonads_js"

            :is="'script'"
            src="https://cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom"
            type="text/javascript"
            async
            class="include-on-static"
        />
    </div>
</template>

<script>
/* Carbon ads */
import '~/assets/css/carbon.css'

export default {}
</script>

<template>
    <!-- This may be able to be brought in via Partytown -->
    <div class="doesitarm-carbon-wrapper">
        <component
            :is="'script'"
            v-once
            id="_carbonads_js"
            src="https://cdn.carbonads.com/carbon.js?serve=CK7DVK3M&placement=doesitarmcom"
            type="text/javascript"
            async
        />
    </div>
</template>

<script>
/* Carbon ads */
import '~/assets/css/carbon.css'

export default {}
</script>

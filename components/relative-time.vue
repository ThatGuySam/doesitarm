<template>

    <span>{{ relativeTime }}</span>

</template>

<script>
import parseDate from '~/helpers/parse-date'

export default {
    props: {
        timestamp: {
            type: Number,
            required: true
        }
    },
    computed: {
        relativeTime () {
            return parseDate(this.timestamp).relative
        }
    }
}

</script>

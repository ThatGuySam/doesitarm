<template>

    <span>{{ relativeTime }}</span>

</template>

<script>
import parseGithubDate from '~/helpers/parse-github-date'

export default {
    props: {
        timestamp: {
            type: Number,
            required: true
        }
    },
    computed: {
        relativeTime () {
            return parseGithubDate(this.timestamp).relative
        }
    }
}

</script>

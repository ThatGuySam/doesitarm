<template>

    <a
        :href="href"
        :target="target"
        :rel="rel"
        :class="classlist"
        role="button"
    >
        <slot />
    </a>

</template>

<script>

export default {
    props: {
        href: {
            type: String,
            required: true
        },
        target: {
            type: String,
            default: null
        },
        classGroups: {
            type: Object,
            default: () => {}
        }
    },
    computed: {
        rel () {
            if (this.href.charAt(0) === '/') return null

            return 'noopener'
        },
        classlist () {
            const defaultClassGroups = {
                general: 'relative inline-flex items-center rounded-md px-4 py-2',
                font: 'leading-5 font-medium',
                text: 'text-white',
                border: 'border border-transparent focus:outline-none focus:border-indigo-600',
                shadow: 'neumorphic-shadow focus:shadow-outline-indigo',
                bg: 'bg-darker hover:bg-indigo-400 active:bg-indigo-600',
                transition: 'transition duration-150 ease-in-out'
            }

            const mergedClassGroups = {
                ...defaultClassGroups,
                ...this.classGroups
            }

            if (this.isFocused) {
                delete mergedClassGroups.blur
            } else {
                delete mergedClassGroups.focus
            }

            return Object.values(mergedClassGroups)
        }
    }
}

</script>

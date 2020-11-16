<template>

    <div
        :class="[
            'h-8 transition-opacity duration-500 ease-in-out',
            visible ? 'opacity-100' : 'opacity-0'
        ]"
    >

        <a
            ref="follow"
            href="https://twitter.com/doesitarm?ref_src=twsrc%5Etfw"
            class="twitter-follow-button"
            data-show-count="false"
        >Follow @doesitarm</a>

    </div>

</template>

<script>

import { observeElementInViewport } from 'observe-element-in-viewport'

export default {
    data: function () {
        return {
            visible: false
        }
    },
    mounted () {
        // https://platform.twitter.com/widgets.js

        // the returned function, when called, stops tracking the target element in the
        // given viewport
        const unobserve = observeElementInViewport(this.$refs.follow, async (_, unobserve, expandZoneElem) => {
            // On element enter viewport
            // console.log('Entered', logoRef)

            this.loadTwitterScript()

            // Turn off this observer
            unobserve()
        }, () => {
            // On element exit viewport
            // console.log('Exited', logoRef)
        }, {
            threshold: [ 0 ]
        })

    },
    methods: {
        loadTwitterScript () {
            const twitterScript = document.createElement('script')

            twitterScript.setAttribute('charset','utf-8')
            twitterScript.setAttribute('async','true')
            twitterScript.setAttribute('src','https://platform.twitter.com/widgets.js')

            twitterScript.onload = () => {

                // Delay reveal for dom update
                setInterval(() => {
                    this.visible = true
                }, 850)
            }

            document.head.appendChild(twitterScript)


            // Reveal after 200ms
            // setInterval(() => {
            //     this.visible = true
            // }, 750)
        }
    }
}

</script>

<template>
    <section class="container py-24">
        <div class="flex flex-col items-center space-y-24">
            <header>

                <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center">
                    Apple Silicon Compatibility
                </h1>
                <h2 class="subtitle md:text-xl text-center">
                    Check for Apple Silicon compatibility for any app instantly before you buy an M1 Mac.
                </h2>

            </header>

            <div
                class="relative w-full flex justify-center"
            >
                <button
                    :class="[
                        'rounded-xl text-3xl font-semibold scale-150 bg-darkest neumorphic-shadow focus:outline-none py-4 px-6'
                    ]"
                    :class-groups="{
                        shadow: 'neumorphic-shadow-inner'
                    }"
                    @click="triggerFilepicker"
                >Select Apps</button>
                <input
                    ref="file-selector"
                    type="file"
                    accept="application/**"
                    multiple
                    hidden
                    @change="fileInputChanged"
                >
            </div>


            <pre class="w-full">{{ appsBeingScanned }}</pre>

            <AllUpdatesSubscribe
                :input-class-groups="{
                    shadow: 'hover:neumorphic-shadow',
                    bg: '',
                    focus: 'bg-transparent neumorphic-shadow pl-8',
                    blur: 'placeholder-white text-center border border-transparent bg-transparent opacity-50 hover:opacity-100 px-3',
                }"
                class="my-12"
            />

        </div>

        <!-- <client-only>
            <FullScreenFileDrop @drop="onDrop" />
        </client-only> -->

    </section>
</template>

<script>
// import axios from 'axios'

import AppFilesScanner from '~/helpers/app-files-scanner.js'


import LinkButton from '~/components/link-button.vue'
import AllUpdatesSubscribe from '~/components/all-updates-subscribe.vue'

export default {
    // async asyncData () {


    //     return {
    //         allAppSearchLinks,
    //         customSummaryNumbers: getListSummaryNumbers(allList)
    //     }
    // },
    components: {
        // FullScreenFileDrop: () => process.client ? import('~/components/fullscreen-file-drop.vue') : null,
        LinkButton,
        AllUpdatesSubscribe
    },
    data: function () {
        return {
            query: '',
            appsBeingScanned: []
        }
    },
    computed: {
        title ()  {
            return `Apple Silicon Compatibility`
        },
        description ()  {
            return `Check for Apple Silicon compatibility for any of your apps instantly before you buy an M1 Mac. `
        }
    },
    mounted () {
        this.scanner = new AppFilesScanner({
            observableFilesArray: this.appsBeingScanned
        })
    },
    methods: {
        triggerFilepicker () {
            this.$refs['file-selector'].dispatchEvent(new MouseEvent("click"))
        },
        fileInputChanged () {
            // console.log('file-selector', this.$refs['file-selector'])

            // Get FileList from input
            const fileList = this.$refs['file-selector'].files

            // console.log('fileInputChanged files', fileList)

            this.scanner.scan( fileList )
        },
        // async onDrop ( formData, fileList ) {
        //     console.log('Off to the races')

        //     // await new Promise(r => setTimeout(r, 2000))

        //     const formValues = formData.values()

        //     for ( const value of formValues ) {
        //         console.log( 'value', value )
        //     }

        //     // console.log( 'formData', formData.values() ) // Can be posted to server
        //     // console.log( 'fileList', fileList )    // Can get access to things like file name and size

        //     this.scanner.scan( fileList )
        // }
        // async onQueryUpdate ( $event ) {
        //     // console.log('$event', $event)
        //     this.query = $event


        //     return
        // }
    },
    head() {
        return {
            title: this.title,
            meta: [
                // hid is used as unique identifier. Do not use `vmid` for it as it will not work
                {
                    'hid': 'description',
                    'name': 'description',
                    'content': this.description
                },

                // Twitter Card
                {
                    'hid': 'twitter:title',
                    'property':  'twitter:title',
                    'content': this.title
                },
                {
                    'hid': 'twitter:description',
                    'property':  'twitter:description',
                    'content': this.description
                },
                {
                    'property':  'twitter:url',
                    'content': `${process.env.URL}${this.$nuxt.$route.path}`
                },
            ]
        }
    }
}
</script>

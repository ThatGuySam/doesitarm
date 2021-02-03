<template>
    <section class="container py-24">
        <div class="flex flex-col items-center space-y-24">
            <header class="flex flex-col items-center space-y-6 md:px-12">

                <div class="title-container relative">
                    <h1 class="title text-3xl md:text-5xl font-hairline leading-tight text-center">
                        Apple Silicon App Test
                    </h1>
                    <div
                        class="beta-pill absolute h-5 text-xs bg-white-2 flex justify-center items-center outline-0 rounded-full ease px-2"
                        style="top: -1em; right: 0;"
                    >
                        Beta
                    </div>
                </div>

                <h2 class="subtitle md:text-xl text-center">
                    Check for Apple Silicon compatibility for your apps before you buy an M1 Mac.
                </h2>

            </header>

            <div
                class="relative w-full flex flex-col justify-center items-center space-y-4"
            >
                <button
                    :class="[
                        'rounded-xl text-3xl font-semibold scale-150 bg-darkest neumorphic-shadow focus:outline-none py-4 px-6',
                        isLoadingFiles ? 'shimmer' : ''
                    ]"
                    @click="triggerFilepicker"
                >{{ isLoadingFiles ? 'Loading Files' : 'Select Apps' }}</button>

                <template v-if="isLoadingFiles">
                    <div>Loading usually takes about a minute per 500mb</div>
                    <button
                        class="underline"
                        @click="isLoadingFiles = false"
                    >Cancel</button>
                </template>

                <small>Supports: Mac Apps, Zip files, and <em>some</em> DMG files. Bigger files take longer.</small>

                <input
                    ref="file-selector"
                    type="file"
                    accept="application/**"
                    multiple
                    hidden
                    @change="fileInputChanged"
                >
                <!-- Directories only: webkitdirectory directory -->
            </div>

            Total Files: {{ foundFiles.length }}

            <div
                v-if="foundFiles.length !== 0"
                class="app-scans-container relative divide-y divide-gray-700 w-full rounded-lg border border-gray-700 bg-gradient-to-br from-darker to-dark my-4 px-5"
            >

                <svg style="display: none;">
                    <defs>
                        <path
                            id="chevron-right"
                            fill-rule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clip-rule="evenodd"
                        />
                    </defs>
                </svg>

                <!-- hasStartedAnyQuery: {{ hasStartedAnyQuery }} -->

                <!-- <div
                    v-if="chunkedResults.length === 0"
                    class="text-center py-4"
                >
                    No apps found
                </div> -->

                <ul
                    class="results-container divide-y divide-gray-700"
                >
                    <li
                        v-for="( appScan, index ) in foundFiles"
                        :key="`${appScan.name}-${index}`"
                        :ref="`${appScan.name}-row`"
                        class="relative"
                    >
                        <!-- app.endpoint: {{ app.endpoint }} -->
                        <div
                            :class="[
                                'flex flex-col justify-center inset-x-0 hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-y-2 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-5',
                                (appScan.status !== 'finished') ? 'shimmer' : ''
                            ]"
                            style="transition-property: border;"
                        >

                            <div class="absolute hidden left-0 h-12 w-12 rounded-full md:flex items-center justify-center bg-darker">
                                {{ appScan.name.charAt(0) }}
                            </div>
                            {{ appScan.name }} <code>{{ appScan.type }}</code>
                            <div class="text-sm leading-5 font-bold">
                                {{ appScan.statusMessage }}
                            </div>

                        </div>

                    </li>
                </ul>

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

// import AppFilesScanner from '~/helpers/app-files-scanner.js'


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
            isLoadingFiles: false,
            appsBeingScanned: []
        }
    },
    computed: {
        foundFiles () {
            return this.appsBeingScanned.filter( appScan => {
                return !appScan.statusMessage.includes('⏭')
            })
        },

        title ()  {
            return `Apple Silicon Compatibility`
        },
        description ()  {
            return `Check for Apple Silicon compatibility for any of your apps instantly before you buy an M1 Mac. `
        }
    },
    mounted () {
        this.scanner = null
    },
    methods: {
        log ( thing ) {
            console.log( thing )
        },

        triggerFilepicker () {
            this.isLoadingFiles = true

            // this.watchFileInput()

            this.$refs['file-selector'].dispatchEvent(new MouseEvent('click'))
        },
        async fileInputChanged () {
            this.isLoadingFiles = false
            // console.log('file-selector', this.$refs['file-selector'])

            // Get FileList from input
            const fileList = this.$refs['file-selector'].files

            // If the scanner instance is not set up yet
            // then create and initialize it
            if ( this.scanner === null ) {
                console.log('Initializing scanner instance')

                // Bring in code
                const { default: AppFilesScanner} = await import('~/helpers/app-files-scanner.js')

                // Initialize instance
                this.scanner = new AppFilesScanner({
                    observableFilesArray: this.appsBeingScanned
                })
            }

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

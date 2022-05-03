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
                    Check for Apple Silicon compatibility for your apps before you buy an M1 Pro or M1 Max Mac.
                </h2>

            </header>

            <div class="app-tester w-full space-y-4 pb-64">

                <div
                    class="relative w-full flex flex-col justify-center items-center space-y-4 pb-8"
                >
                    <button
                        :class="[
                            'rounded-xl text-3xl font-semibold scale-150 bg-darkest neumorphic-shadow focus:outline-none py-4 px-6',
                            isLoadingFiles ? 'shimmer' : ''
                        ]"
                        aria-label="Pick an app to scan"
                        @click="triggerFilepicker"
                    >{{ isLoadingFiles ? 'Loading Files' : 'Select Apps' }}</button>

                    <template v-if="isLoadingFiles">
                        <div>Loading usually takes about a minute per 500mb</div>
                        <button
                            class="underline"
                            @click="isLoadingFiles = false"
                        >Cancel</button>
                    </template>

                    <div>
                        <small>
                            <span>Supports: Mac Apps, Zip files. Extract DMGs and PKGs first. Bigger files take longer. </span>
                            <a
                                href="https://www.youtube.com/watch?v=icq9wJx7wbg"
                                class="underline"
                                rel="noopener"
                            >How it works</a>
                        </small>
                    </div>

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


                <div
                    v-if="foundFiles.length !== 0"
                    class="w-full text-center"
                >
                    Total Files: {{ foundFiles.length }}
                </div>

                <div
                    v-if="foundFiles.length !== 0"
                    class="app-scans-container relative divide-y divide-gray-700 w-full rounded-lg border border-gray-700 bg-gradient-to-br from-darker to-dark spac-y-3 my-4 px-5"
                >

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
                                    'flex flex-col justify-center inset-x-0 hover:bg-darkest border-2 border-white border-opacity-0 hover:border-opacity-50 focus:outline-none focus:bg-gray-50 duration-300 ease-in-out rounded-lg space-y-3 -mx-5 pl-5 md:pl-20 pr-6 md:pr-64 py-5',
                                    (appScan.status !== 'finished') ? 'shimmer' : ''
                                ]"
                                style="transition-property: border;"
                            >

                                <div class="absolute hidden left-0 h-12 w-12 rounded-full md:flex items-center justify-center bg-darker">
                                    {{ appScan.name.charAt(0) }}
                                </div>
                                {{ appScan.displayName || appScan.name }}
                                {{ appScan.appVersion ? `- v${appScan.appVersion}` : '' }}
                                {{ appScan.displayAppSize ? `- App ${appScan.displayAppSize}` : '' }}
                                {{ appScan.displayBinarySize ? `- Binary ${appScan.displayBinarySize}` : '' }}
                                <div class="text-sm leading-5 font-bold">
                                    {{ appScan.statusMessage }}
                                </div>

                                <!-- appScan.binarySize: {{ appScan.binarySize }} -->

                                <div
                                    v-if="appScan.binarySize && appScan.binarySize < (10 ^ 6)"
                                    class="text-sm leading-5 font-bold"
                                >
                                    ⚠️ Large Binary - This scan may take a while an/or have issues
                                </div>

                                <details class="w-full pt-6">
                                    <summary class="cursor-pointer mb-3">Details</summary>
                                    <div>
                                        <div v-if="appScan.details.length === 0">No details available</div>
                                        <ul v-else>
                                            <li
                                                v-for="( detail ) in appScan.details"
                                                :key="`${appScan.name}-detail-${detail.label}`"
                                            ><strong>{{ detail.label }}</strong> <span v-html="detail.value" /></li>
                                        </ul>
                                    </div>
                                </details>

                                <div class="flex flex-col md:flex-row space-x-0 space-y-4 md:space-y-0 md:space-x-4">
                                    <a
                                        :href="`https://github.com/ThatGuySam/doesitarm/issues?q=is%3Aissue+${appScan.displayName || appScan.name}`"
                                        class="underline"
                                    >Request a Review</a>
                                </div>

                            </div>

                        </li>
                    </ul>

                </div>

            </div>

            <div class="w-full max-w-2xl">
                <details
                    v-for="([ question, answer ], index) in faqs"
                    :key="`question-${index}`"
                    class="w-full"
                >
                    <summary class="cursor-pointer">{{ question }}</summary>
                    <div class="p-4">
                        <p>{{ answer }}</p>
                    </div>
                </details>
            </div>


        </div>

        <!-- <client-only>
            <FullScreenFileDrop @drop="onDrop" />
        </client-only> -->

    </section>
</template>

<script>
// import axios from 'axios'

// import AppFilesScanner from '~/helpers/app-files-scanner.js'

import { isNuxt } from '~/helpers/environment.js'

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

        faqs () {
            return [
                [
                    'Non-native Apps (🔶)',
                    `
                    When an App scan is reported and Non-native (as indicated by an 🔶), that means the app file provided does not have native compatibility with Apple Silicon, and we have not had any reports of native versions of the app yet.
                    This doesn't necessarily mean the app won't work, it just means it hasn't been updated for Apple Silicon specifically and can't say for certain that it will definitely work.
                    Most apps reported as Non-native will usually still work under Rosetta 2 Translation with similar performance to the app's experience under an Intel-based Mac.
                    You can try getting the latest version from the developer\'s the download page scan that.
                    You can also request a manual review to determine the current status of the app on Rosetta 2.
                    `
                ],
                [
                    'App Decompression Error (❔)',
                    `
                    This means we weren't able to extract an App Binary from the file provided.
                    If your app is contained within a PKG or a DMG file, you can extract the Mac App file from that Package/Archive and scan it directly.

                    If you are scanning from Windows, an EXE file is not scannable; however, you can download the Mac version of the app and extract it onto your Windows system, and that Mac App file can be scanned from your Windows computer.
                    This also applies when scanning apps from Linux-based Systems, ChromeOS, iOS, and, in theory, any system capable of running modern Javascript in a browser and extracting compressed files.


                    Currently, the supported formats are Mac Apps, Zip files containing Mac Apps, and specific rare DMG files. Bigger files take longer to scan.
                    `
                ],
                [
                    'What if the scan never ends?',
                    `
                    Currently, some random apps will cause the scan to hang indefinitely.
                    If this happens, you can try scanning a few apps at a time or one at a time until it hangs again and skip scanning that app for now.
                    `
                ],
                [
                    'Why can\'t it tell me if an app will work on Rosetta 2? ',
                    `
                    Currently, Rosetta 2 is a proprietary Apple software that is only available on macOS on Apple Silicon devices.
                    This means there isn't any way to test Rosetta 2 compatibility with an app without a physical Apple Silicon device, and so you definitely can't test that with just a website alone... for now...

                    Feel free to signup for email updates.
                    `
                ],
                [
                    'Don\'t all previous Mac Apps work via Rosetta 2 translation? ',
                    `
                    Most apps will work with Rosetta 2 translation well, but it's not a perfect technology.
                    Some apps will have various small issues and graphical bugs but will work well enough, a few apps will fail to launch entirely, and some apps will run with virtually no problems and perform even faster than on an equivalent Intel-based Mac.
                    For now, the best way to determine how well an app will run under Rosetta 2 is by human review.
                    `
                ]
            ]
        },

        title ()  {
            return `Apple Silicon Compatibility Test Online`
        },
        description ()  {
            return `Check for Apple Silicon compatibility for any of your apps instantly before you buy an M1 Pro or M1 Max Mac. `
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
                const { default: AppFilesScanner } = await import('~/helpers/app-files-scanner.js')

                const testResultStore = isNuxt( this ) ? this.$config.testResultStore : global.$config.testResultStore

                // Initialize instance
                this.scanner = new AppFilesScanner({
                    observableFilesArray: this.appsBeingScanned,
                    testResultStore
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

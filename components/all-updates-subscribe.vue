<template>

    <div>
        <div
            v-if="feedbackMessage === null"
        >
            <form
                class="all-updates-subscribe text-xs relative"
                @submit.prevent="trySubmit"
            >
                <label
                    v-if="isFocused"
                    :for="inputId"
                    class="block font-bold absolute"
                    style="top: -2em;"
                >Email</label>
                <div class="mt-1 relative rounded-md shadow-sm">
                    <div
                        v-if="isFocused"
                        class="absolute inset-y-0 left-0 pl-1 flex items-center pointer-events-none"
                    >
                        <!-- Heroicon name: mail -->
                        <svg
                            class="h-5 w-5 text-gray-500"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                    </div>
                    <input
                        :id="inputId"
                        v-model="email"
                        :class="inputClasslist"
                        :placeholder="isFocused ? 'me@email.com' : placeholder"
                        :aria-label="placeholder"
                        name="all-updates-subscribe"
                        style="width: 240px;"
                        type="email"
                        required
                        @focus="isFocused = true"
                        @blur="isFocused = false"
                    >
                </div>
            </form>
        </div>

        <div
            v-if="feedbackMessage"
            class="text-center p-4"
        >
            {{ feedbackMessage }}
        </div>
    </div>

</template>

<script>

import axios from 'axios'
import { v4 as uuid } from 'uuid'

import { isNuxt } from '~/helpers/environment.js'

export default {
    props: {
        // appName: {
        //     type: String,
        //     required: true
        // },
        placeholder: {
            type: String,
            default: 'Send me regular app updates'
        },
        notes: {
            type: String,
            default: ''
        },
        inputClassGroups: {
            type: Object,
            default: () => {}
        },
        uuid: {
            type: String,
            default: uuid()
        }
    },
    data: function () {
        return {
            email: '',

            isFocused: false,
            feedbackMessage: null,
        }
    },
    computed: {
        inputId () {
            return `all-updates-subscribe-${ this.uuid }`
        },
        inputClasslist () {
            const defaultClassGroups = {
                general: 'form-input block w-full rounded-md py-1',
                shadow: 'neumorphic-shadow',
                bg: 'bg-darker',
                focus: 'pl-8',
                blur: 'placeholder-white text-center border border-transparent px-3',
            }

            const mergedClassGroups = {
                ...defaultClassGroups,
                ...this.inputClassGroups
            }

            if (this.isFocused) {
                delete mergedClassGroups.blur
            } else {
                delete mergedClassGroups.focus
            }

            return Object.values(mergedClassGroups)
        }
    },

    methods: {
        async trySubmit () {
            console.log('Trying submit')

            // Set intermediate message
            this.feedbackMessage = 'Sending...'

            // const pagePath = $nuxt.$route.path

            const allUpdateSubscribe = isNuxt( this ) ? this.$config.allUpdateSubscribe : global.$config.allUpdateSubscribe

            console.log('allUpdateSubscribe', allUpdateSubscribe)


            // https://stackoverflow.com/questions/51995070/post-data-to-a-google-form-with-ajax/55496118#55496118
            const actionUrl = allUpdateSubscribe

            console.log('actionUrl', actionUrl)

            axios({
                method: 'post',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                url: actionUrl,
                data: {
                    // Email
                    'email': this.email
                },
            }).then( response => {

                this.feedbackMessage = 'We\'ll keep you informed!'

                // console.log('response', response)
                // if (response.status === 200) {
                //     this.feedbackMessage = '- We\'ll keep an eye on it for you!'
                // } else {
                //     this.feedbackMessage = 'Oops! Something went wrong'
                // }
            }).catch( error => {
                console.warn('error', error)
                this.feedbackMessage = 'Something went wrong. Try refreshing. '
            })

            // .catch(error => {
            //     // handle error
            //     console.error('Error Subscribing -', error)
            //     this.feedbackMessage = 'Oops! Something went wrong'
            // })
        }
    }
}

</script>

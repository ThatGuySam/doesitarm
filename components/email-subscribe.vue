<template>

    <div>
        <div
            v-if="feedbackMessage === null"
        >
            <form
                class="email-subscribe text-xs relative"
                @submit.prevent="trySubmit"
            >
                <label
                    v-if="isFocused"
                    :for="inputId"
                    class="block font-medium absolute"
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
                        :placeholder="isFocused ? 'me@email.com' : 'Tell me when this changes'"
                        aria-label="Email Address"
                        name="email-subscribe"
                        style="width: 230px;"
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

export default {
    props: {
        appName: {
            type: String,
            required: true
        },
        notes: {
            type: String,
            default: ''
        },
        inputClassGroups: {
            type: Object,
            default: () => {}
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
            return `email-subscribe-${this._uid}`
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

            const formActionUrl = `https://docs.google.com/forms/d/e/1FAIpQLSdWUAVabT3i1ExfnPgRKnk-s-aWLlOuy0d5JjMKDwKtrwXj1Q/formResponse?entry.710297191=${this.appName}&emailAddress=${this.email}&submit=Submit`


            axios({
                method: 'get',
                url: formActionUrl,
                // data: {
                //     // Email
                //     'emailAddress': this.email,

                //     // App Name
                //     'entry.710297191': this.appName,
                //     // Notes
                //     // 'entry.2040856090': '',

                //     'submit': 'Submit'
                // },
            }).finally( response => {

                this.feedbackMessage = 'We\'ll keep an eye on it for you!'

                // console.log('response', response)
                // if (response.status === 200) {
                //     this.feedbackMessage = '- We\'ll keep an eye on it for you!'
                // } else {
                //     this.feedbackMessage = 'Oops! Something went wrong'
                // }
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

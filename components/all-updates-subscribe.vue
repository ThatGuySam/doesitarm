<template>
    <div>
        <div
            v-if="feedbackMessage === null"
        >
            <form
                ref="form"
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
                        autocomplete="email"
                        name="all-updates-subscribe"
                        style="width: 240px;"
                        type="email"
                        required
                        @focus="isFocused = true"
                        @blur="isFocused = false"
                        @keydown.enter.prevent="requestSubmit"
                    >
                    <!--
                        The field is meant to stay quiet: it looks like a button
                        until it is clicked. The submit button only appears once
                        something is typed, so there is a clear way to send it.
                        It also gives the form a default button, which browsers
                        need before Enter submits a form with a second text
                        field (the honeypot below).
                    -->
                    <button
                        v-if="hasEmail"
                        class="absolute inset-y-0 right-0 my-1 mr-1 px-2 rounded bg-blue-600 hover:bg-blue-500 focus:bg-blue-500 text-white font-bold"
                        type="submit"
                        aria-label="Subscribe to weekly app updates"
                        @mousedown.prevent
                    >
                        Subscribe
                    </button>
                    <input
                        v-model="website"
                        aria-hidden="true"
                        autocomplete="off"
                        class="hidden"
                        name="website"
                        tabindex="-1"
                        type="text"
                    >
                </div>
                <p
                    v-if="errorMessage"
                    class="mt-2 text-center text-red-400"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>
            </form>
        </div>

        <div
            v-if="feedbackMessage"
            class="text-center p-4"
            role="status"
        >
            {{ feedbackMessage }}
        </div>
    </div>
</template>

<script>

import { v4 as uuid } from 'uuid'

import { postJson } from '~/helpers/http.js'

const subscriptionEndpoint = 'https://doesitarm.com/api/subscriptions'

export default {
    props: {
        // appName: {
        //     type: String,
        //     required: true
        // },
        placeholder: {
            type: String,
            default: '✉️ Get App Updates'
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
            // Lazy factory, not `uuid()`: a bare call evaluates at module load,
            // which (a) makes every instance share one id and (b) generates a
            // random value in global scope — forbidden on the Workers runtime
            // (workerd), 500-ing every SSR page. A factory runs per-instance at
            // render time, inside the request handler.
            default: () => uuid()
        }
    },
    data: function () {
        return {
            email: '',
            website: '',

            isFocused: false,
            isSending: false,
            feedbackMessage: null,
            errorMessage: null,
        }
    },
    computed: {
        hasEmail () {
            return this.email.trim().length > 0
        },
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
                // Room for the submit button once something is typed
                button: this.hasEmail ? 'pr-20' : '',
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
        requestSubmit () {
            const form = this.$refs.form

            if ( !form ) return

            if ( typeof form.requestSubmit === 'function' ) {
                // Runs native validation, then fires the submit event
                form.requestSubmit()
                return
            }

            if ( form.reportValidity() ) {
                this.trySubmit()
            }
        },
        async trySubmit () {
            if ( this.isSending ) return

            this.isSending = true
            this.errorMessage = null
            this.feedbackMessage = 'Sending...'

            try {
                const response = await postJson( subscriptionEndpoint, {
                    email: this.email,
                    website: this.website
                } )
                // The Worker says whether a confirmation email went out
                this.feedbackMessage = response?.confirmationSent
                    ? 'Check your inbox to confirm your subscription.'
                    : 'You\'re on the list! New Apple Silicon apps, weekly.'
            } catch ( error ) {
                console.warn( 'Subscription failed', error )
                // Bring the field back so they can fix the address or retry
                this.feedbackMessage = null
                this.errorMessage = 'That didn\'t go through. Check the address and try again.'
            } finally {
                this.isSending = false
            }
        }
    }
}

</script>

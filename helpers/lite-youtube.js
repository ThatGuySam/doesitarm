// https://github.com/paulirish/lite-youtube-embed/blob/master/src/lite-yt-embed.js

// import canAutoPlay from 'can-autoplay'


/**
 * A lightweight youtube embed. Still should feel the same to the user, just MUCH faster to initialize and paint.
 *
 * Thx to these as the inspiration
 *   https://storage.googleapis.com/amp-vs-non-amp/youtube-lazy.html
 *   https://autoplay-youtube-player.glitch.me/
 *
 * Once built it, I also found these:
 *   https://github.com/ampproject/amphtml/blob/master/extensions/amp-youtube (👍👍)
 *   https://github.com/Daugilas/lazyYT
 *   https://github.com/vb/lazyframe
 */

function isObject( maybeObject ) {
    return maybeObject === Object( maybeObject )
}
class LiteYTEmbed extends HTMLElement {
    constructor() {
        // Always call super first in constructor
        super()

        this._uid = Date.now()
        this.$refs = {}

        this.$refs['timestamps-scroll-container'] = this.querySelector('.player-timestamps-wrapper')

        this.playerLoaded = false
        this.player = null
        this.playing = false
        this.progressInterval = null
        this.playerTime = 0
        this.preconnected = false

        this.highlightedTimestampElement = null
    }

    connectedCallback() {
        this.videoId = this.getAttribute('videoid')
        this.videoDataScript = this.querySelector('.video-data')
        this.video = JSON.parse( this.videoDataScript.innerHTML )

        this.playerContainer = this.querySelector('.player-container')
        this.playerPoster = this.querySelector('.player-poster')

        // console.log('canAutoplay from connectedCallback', canAutoplay)

        console.log('video', this.video)
        console.log('this.playerContainer', this.playerContainer)


        // Start watchers here


        // On hover (or tap), warm up the TCP connections we're (likely) about to use.
        this.playerContainer.addEventListener('pointerover', this.warmConnections, {once: true})

        if ( this.hasTimestamps() ) {
            // Array.from( this.querySelectorAll(`.player-timestamps [time]`) )

            this.timestamps().map( timestamp => {
                const timestampButton = this.querySelector(`.player-timestamps [time="${timestamp.time}"]`)

                timestampButton.addEventListener('click', e => {
                    this.seekTo(timestamp.inSeconds)
                })
            })
        }

        // Once the user clicks, add the real iframe and drop our play button
        // TODO: In the future we could be like amp-youtube and silently swap in the iframe during idle time
        //   We'd want to only do this for in-viewport or near-viewport ones: https://github.com/ampproject/amphtml/pull/5003
        this.playerPoster.addEventListener('click', e => {
            this.startPlayerLoad()
        })


        // Mounted

        this.detectAutoplay()
            .then( ({ willAutoplay }) => {
                console.log('willAutoplay', willAutoplay)

                // If we're allowed to autoplay
                // then start loading the player
                if ( willAutoplay === true ) {
                    this.startPlayerLoad()
                }
            })
    }

    // // TODO: Support the the user changing the [videoid] attribute
    // attributeChangedCallback() {
    // }

    /**
     * Add a <link rel={preload | preconnect} ...> to the head
     */
    // static c(kind, url, as) {
    //     const linkEl = document.createElement('link')
    //     linkEl.rel = kind
    //     linkEl.href = url
    //     if (as) {
    //         linkEl.as = as
    //     }
    //     document.head.append(linkEl)
    // }

    /**
     * Begin pre-connecting to warm up the iframe load
     * Since the embed's network requests load within its iframe,
     *   preload/prefetch'ing them outside the iframe will only cause double-downloads.
     * So, the best we can do is warm up a few connections to origins that are in the critical path.
     *
     * Maybe `<link rel=preload as=document>` would work, but it's unsupported: http://crbug.com/593267
     * But TBH, I don't think it'll happen soon with Site Isolation and split caches adding serious complexity.
     */
    // static warmConnections() {
    //     if (LiteYTEmbed.preconnected) return

    //     // The iframe document and most of its subresources come right off youtube.com
    //     LiteYTEmbed.addPrefetch('preconnect', 'https://www.youtube-nocookie.com')
    //     // The botguard script is fetched off from google.com
    //     LiteYTEmbed.addPrefetch('preconnect', 'https://www.google.com')

    //     // Not certain if these ad related domains are in the critical path. Could verify with domain-specific throttling.
    //     LiteYTEmbed.addPrefetch('preconnect', 'https://googleads.g.doubleclick.net')
    //     LiteYTEmbed.addPrefetch('preconnect', 'https://static.doubleclick.net')

    //     LiteYTEmbed.preconnected = true
    // }

    addIframe() {
        const classNames = 'absolute inset-0 h-full w-full object-cover'

        // https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&modestbranding=1&playsinline=1

        // const params = new URLSearchParams(this.getAttribute('params') || [])
        // params.append('autoplay', '1')

        const iframeEl = document.createElement('iframe')

        this.$refs['frame'] = iframeEl

        iframeEl.width = '100%'
        iframeEl.height = '100%'
        // No encoding necessary as [title] is safe. https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html#:~:text=Safe%20HTML%20Attributes%20include
        // iframeEl.title = this.playLabel
        iframeEl.id = this.frameId()
        iframeEl.classList.add(...classNames.split(' '))
        iframeEl.frameborder = '0'
        iframeEl.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture'
        iframeEl.allowFullscreen = true
        // AFAIK, the encoding here isn't necessary for XSS, but we'll do it only because this is a URL
        // https://stackoverflow.com/q/64959723/89484
        iframeEl.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(this.video.id)}?enablejsapi=1&autoplay=1&modestbranding=1&playsinline=1`

        // this.append(iframeEl)
        this.playerContainer.innerHTML = ''
        this.playerContainer.append( iframeEl )

        this.classList.add('lyt-activated')

        // Set focus for a11y
        this.querySelector('iframe').focus()
    }


    // Computed methods

    frameId = () => {
        return `youtube-player-${this.video.id}-${this._uid}`
    }

    timestamps = () => {
        return this.video.timestamps.map( timestamp => {
            const [ minutes, seconds ] = timestamp.time.split(':')

            return {
                ...timestamp,
                inSeconds: (minutes * 60) + Number(seconds)
            }
        })
    }

    hasTimestamps = () => {
        return this.timestamps().length > 0
    }

    hasPlayer = () => {
        return this.player !== null
    }

    activeTimestamp = () => {
        const currentTime = this.playerTime// / 100

        const reversesTimestamps = [
            ...this.timestamps()
        ]

        // reversesTimestamps.reverse()

        let foundTimestamp = null

        for (const timestamp of reversesTimestamps) {
            const hasStarted = currentTime > 1
            const currentTimeisAfterPreviousTimestamp = (foundTimestamp !== null) ? currentTime > foundTimestamp.inSeconds : true
            // const isPastCurrentTime = currentTime > timestamp.inSeconds
            // const isBeforeCurrentTime = currentTime > timestamp.inSeconds
            const currentTimeIsBeforeThisTimestamp = currentTime < timestamp.inSeconds

            if (currentTimeisAfterPreviousTimestamp && currentTimeIsBeforeThisTimestamp) {
                return foundTimestamp
            }

            foundTimestamp = timestamp
        }

        // No active timestamp
        return null
    }

    highlightActiveTimestamp = () => {
        const activeClassList = 'border-opacity-100 bg-darkest'
        const inactiveClassList = 'border-opacity-0 neumorphic-shadow-inner'

        const activeTimestamp = this.activeTimestamp()

        // If there's no active timestamp
        // then stop
        if ( activeTimestamp === null ) return

        // console.log('activeTimestamp', activeTimestamp)

        if ( isObject( this.highlightedTimestampElement ) && this.highlightedTimestampElement.time === activeTimestamp.time) return

        // Change active timestamp

        const newActiveTimestamp = this.querySelector(`[time="${activeTimestamp.time}"]`)

        // If there's already a highlited time stamp
        // then unhighlight it
        if ( isObject( this.highlightedTimestampElement ) ) {
            this.highlightedTimestampElement.classList.remove(...activeClassList.split(' '))
            this.highlightedTimestampElement.classList.add(...inactiveClassList.split(' '))
        }

        newActiveTimestamp.classList.remove(...inactiveClassList.split(' '))
        newActiveTimestamp.classList.add(...activeClassList.split(' '))

        // Scroll to new timestamp
        this.scrollToTimestampButton( newActiveTimestamp )

        this.highlightedTimestampElement = newActiveTimestamp

        // console.log('newActiveTimestamp', newActiveTimestamp)
        // console.log('this.highlightedTimestampElement', this.highlightedTimestampElement)
    }

    scrollToTimestampButton ( timestampButton ) {

        // If timestamp button doesn't exist
        // then stop
        if ( !isObject( timestampButton ) ) return

        const timestampsScroller = this.$refs['timestamps-scroll-container']
        // const [ timestampButton ] = this.$refs[`timestamp-${timestamp.time}`]

        // https://stackoverflow.com/a/63773123/1397641
        const newScrollPosition = timestampButton.offsetLeft - timestampsScroller.offsetLeft

        // console.log('timestampsScroller', timestampsScroller)
        // console.log('timestampButton', timestampButton)
        // console.log('newScrollPosition', newScrollPosition)

        timestampsScroller.scroll({ left: newScrollPosition, behavior: 'smooth' })
    }

    detectAutoplay = async () => {

        // if ( !process.client ) return { willAutoplay: false }

        // const { default: canAutoPlay } = await import('can-autoplay')

        const willAutoplay = await canAutoplay.video()
        // const willAutoplayMuted = await canAutoPlay.video({ muted: true, inline: true })

        return {
            willAutoplay: willAutoplay.result
        }
    }

    seekTo = async (timestampInSeconds) => {

        if (this.playerLoaded === false) {
            await this.startPlayerLoad()
        }

        this.player.seekTo(timestampInSeconds)
    }

    // async playVideo() {

    //     if (this.playerLoaded === false) {
    //         await this.startPlayerLoad()
    //     }

    //     this.$nextTick(() => {
    //         // console.log('this.player', JSON.stringify(this.player))
    //         this.player.playVideo()
    //     })
    // },

    addPrefetch = (kind, url, as) => {
        // console.log('prefetching', url)

        const linkEl = document.createElement('link')

        linkEl.rel = kind
        linkEl.href = url

        if (as) {
            linkEl.as = as;
        }

        document.head.append(linkEl)
    }

    warmConnections = () => {
        if (this.preconnected) return

        console.log('Warming connections')

        // The iframe document and most of its subresources come right off youtube.com
        this.addPrefetch('preconnect', 'https://www.youtube-nocookie.com')
        // The botguard script is fetched off from google.com
        this.addPrefetch('preconnect', 'https://www.google.com')

        // Not certain if these ad related domains are in the critical path. Could verify with domain-specific throttling.
        this.addPrefetch('preconnect', 'https://googleads.g.doubleclick.net')
        this.addPrefetch('preconnect', 'https://static.doubleclick.net')

        this.preconnected = true
    }

    startPlayerLoad = async () => {
        // console.log('Starting player load')

        this.addIframe()

        this.playerLoaded = true

        await this.initializePlayer()

        // this.$nextTick(() => {
        //     this.initializePlayer()
        // })
    }

    initializePlayer = async () => {
        console.log('Initializing player')

        // Clear player
        this.player = null

        // Clear progession interval
        clearInterval(this.progressInterval)

        // If there are no timestamps
        // then stop
        if ( !this.hasTimestamps() ) {
            console.log('No timestamps. Skipping Youtube API initialization')

            this.playerLoaded = true
            return
        }

        if (typeof YT === 'undefined') {
            await this.initializeApi()
        }

        const stateHandlers = {
            // unstarted
            '-1': () => null,
            // ended
            '0': () => null,
            // playing
            '1': this.onPlayerPlaying,
            // paused
            '2': this.onPlayerPaused,
            // buffering
            '3': () => null,
            // video cued
            '4': () => null,
        }

        // console.log('frame', this.$refs['frame'])
        // console.log('frame id', this.$refs['frame'].id)

        const onReady = () => new Promise( resolve => {

            // console.log('Started onReady')

            this.player = new YT.Player(this.$refs['frame'].id, {
                events: {
                    'onReady': readyEvent => {
                        // console.log('Resolving onReady')

                        this.onPlayerReady( readyEvent )

                        resolve( readyEvent )
                    },
                    'onStateChange': event => {
                        // console.log('state changed', event)

                        const stateHandler = stateHandlers[String(event.data)]
                        // console.log('stateHandler', stateHandler)
                        stateHandler(event)
                    }
                }
            })

        })

        // console.log('Waiting for ready')

        const readyEvent = await onReady()

        // console.log('Youtube Player API ready', readyEvent, JSON.stringify(this.player))
    }

    initializeApi = () => {
        return new Promise( resolve => {
            const tag = document.createElement('script')
            tag.id = `youtube-api-script-${this._uid}`
            tag.src = 'https://www.youtube.com/iframe_api'

            const firstScriptTag = document.getElementsByTagName('script')[0]
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)


            window.onYouTubeIframeAPIReady = resolve
        })
    }

    onPlayerPlaying = () => {
        // console.log('Player playing')
        this.playing = true

        this.progressInterval = setInterval(() => {
            // console.log('this.player.getCurrentTime()', this.player.getCurrentTime())

            // If player is empty
            // then stop
            if (this.player === null) {
                clearInterval(this.progressInterval)
                return
            }

            // console.log('this.player', this.player.hasOwnProperty('getCurrentTime'))

            this.playerTime = this.player.getCurrentTime()

            this.highlightActiveTimestamp()

        }, 500)
    }

    onPlayerPaused = () => {
        console.log('Player paused')
        this.playing = false

        clearInterval(this.progressInterval)
    }

    onPlayerReady (event) {
        // console.log('Player is ready', event, this.player )
    }
}
// Register custom element
window.customElements.define('lite-youtube', LiteYTEmbed)

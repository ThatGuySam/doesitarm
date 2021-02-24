
function pill ( text ) {
    return /* html */`
        <div
            class="video-pill h-5 text-xs bg-white-2 flex justify-center items-center outline-0 rounded-full ease px-2"
        >
            ${ text }
        </div>
    `
}

export default function ( video, options = {} ) {
    const {
        width = '325px',
        classes = 'w-full flex-shrink-0 flex-grow-0 border-2 border-transparent rounded-2xl overflow-hidden'
    } = options

    // Setup inline lazysizes
    this.usingComponent( 'node_modules/lazysizes/lazysizes.min.js' )

    // console.log('video', video)

    return /* html */`
<div class="video-card ${ classes }" style="max-width: ${ width }; flex-basis: ${ width }; scroll-snap-align: start;">
    <a
        href="${video.endpoint}"
        class=""
    >
        <div class="video-card-container relative overflow-hidden bg-black">
            <div class="video-card-image ratio-wrapper">
                <div class="relative overflow-hidden w-full pb-16/9">
                    <picture>
                        <source
                            sizes="${video.thumbnail.sizes}"
                            data-srcset="${video.thumbnail.srcset}"
                            type="image/jpg"
                        >
                        <img
                            data-src="${video.thumbnail.src}"
                            alt="${video.name}"
                            class="lazyload absolute h-full w-full object-cover"
                        >
                    </picture>
                </div>
            </div>
            <div
                style="--gradient-from-color: rgba(0, 0, 0, 1); --gradient-to-color: rgba(0, 0, 0, 0.7)"
                class="video-card-overlay absolute inset-0 flex justify-between items-start bg-gradient-to-tr from-black to-transparent p-4"
            >
                <div class="play-circle w-8 h-8 bg-white-2 flex justify-center items-center outline-0 rounded-full ease">
                    <svg
                        viewBox="0 0 18 18"
                        style="width:18px;height:18px;margin-left:3px"
                    >
                        <path
                            fill="currentColor"
                            d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"
                        />
                    </svg>
                </div>

                ${ (video.tags.includes('benchmark')) ? pill('Benchmark') : '' }

            </div>

            <!-- Video Text Content -->
            <div class="video-card-content absolute inset-0 flex items-end py-4 px-6">
                <div class="w-full text-sm text-left whitespace-normal">${ video.name }</div>
            </div>
        </div>
    </a>
</div>
`
}

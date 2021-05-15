export default async function ( video, options = {} ) {
    const {
        width = '325px',
        classes = 'w-full flex-shrink-0 flex-grow-0 border-2 border-transparent rounded-2xl overflow-hidden'
    } = options

    // Setup inline player script
    await this.usingComponent( 'node_modules/can-autoplay/build/can-autoplay.min.js' )

    await this.usingComponent( 'helpers/lite-youtube.js' )

    // Setup inline lazysizes
    await this.usingComponent( 'node_modules/lazysizes/lazysizes.min.js' )

    // console.log('video', video)

    return /* html */`
<lite-youtube
    class="video-canvas w-screen flex flex-col justify-center items-center bg-black pt-16"
    style="left:50%;right:50%;margin-left:-50vw;margin-right:-50vw;"
>
    <script class="video-data" type="application/json">
        ${ JSON.stringify( video ) }
    </script>
    <div class="ratio-wrapper w-full max-w-4xl">
        <div class="player-container relative overflow-hidden w-full pb-16/9">
            <div class="player-poster cursor-pointer">
                <picture>
                    <source sizes="(max-width: 640px) 100vw, 640px" data-srcset="https://i.ytimg.com/vi_webp/IJbmCNGPAbc/default.webp 120w, https://i.ytimg.com/vi_webp/IJbmCNGPAbc/mqdefault.webp 320w, https://i.ytimg.com/vi_webp/IJbmCNGPAbc/hqdefault.webp 480w, https://i.ytimg.com/vi_webp/IJbmCNGPAbc/sddefault.webp 640w" type="image/webp">
                    <source sizes="(max-width: 640px) 100vw, 640px" data-srcset="https://i.ytimg.com/vi/IJbmCNGPAbc/default.jpg 120w, https://i.ytimg.com/vi/IJbmCNGPAbc/mqdefault.jpg 320w, https://i.ytimg.com/vi/IJbmCNGPAbc/hqdefault.jpg 480w, https://i.ytimg.com/vi/IJbmCNGPAbc/sddefault.jpg 640w" type="image/jpeg">
                    <img data-src="https://i.ytimg.com/vi/IJbmCNGPAbc/default.jpg" alt="M1 Macs + Windows 10 GAMING and PERFORMANCE Improvements with Parallels 16.5!" class="absolute inset-0 h-full w-full object-cover lazyload">
                </picture>
                <div class="video-card-overlay absolute inset-0 flex flex-col justify-center items-center bg-gradient-to-tr from-black to-transparent p-4" style="--gradient-from-color:rgba(0, 0, 0, 1); --gradient-to-color:rgba(0, 0, 0, 0.7);">
                    <div class="cover-top h-full"></div>
                    <div class="play-circle bg-white-2 bg-blur flex justify-center items-center outline-0 rounded-full ease p-4">
                        <svg viewBox="0 0 18 18" style="width:18px;height:18px;margin-left:3px">
                            <path fill="currentColor" d="M15.562 8.1L3.87.225c-.818-.562-1.87 0-1.87.9v15.75c0 .9 1.052 1.462 1.87.9L15.563 9.9c.584-.45.584-1.35 0-1.8z"></path>
                        </svg>
                    </div>
                    <div class="cover-bottom h-full">
                        <div class="page-heading h-full flex items-end md:p-4">
                            <h1 class="title text-xs text-left md:text-2xl font-bold">M1 Macs + Windows 10 GAMING and PERFORMANCE Improvements with Parallels 16.5!</h1>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="video-timestamps w-full max-w-4xl">
        <div class="featured-apps overflow-x-auto overflow-y-visible whitespace-no-wrap py-2 space-x-2"><button data-time="00:00" class-groups="[object Object]" class="inline-block text-xs rounded-lg py-1 px-2 border-2 border-white focus:outline-none border-opacity-0 neumorphic-shadow-inner">00:00 What is Parallels?</button><button data-time="00:35" class-groups="[object Object]" class="inline-block text-xs rounded-lg py-1 px-2 border-2 border-white focus:outline-none border-opacity-0 neumorphic-shadow-inner">00:35 What’s New In Version 16.5?</button><button data-time="01:42" class-groups="[object Object]" class="inline-block text-xs rounded-lg py-1 px-2 border-2 border-white focus:outline-none border-opacity-0 neumorphic-shadow-inner">01:42 Performance Improvements</button><button data-time="03:11" class-groups="[object Object]" class="inline-block text-xs rounded-lg py-1 px-2 border-2 border-white focus:outline-none border-opacity-0 neumorphic-shadow-inner">03:11 Windows 10 Gaming Improvements</button><button data-time="05:11" class-groups="[object Object]" class="inline-block text-xs rounded-lg py-1 px-2 border-2 border-white focus:outline-none border-opacity-0 neumorphic-shadow-inner">05:11 Does Valorant Work?</button></div>
    </div>
</lite-youtube>
    `
}

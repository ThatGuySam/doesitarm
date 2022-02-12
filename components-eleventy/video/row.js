
import VideoCard from './card.js'
import SubmitCard from './submit-card.js'

function getCardType ( video ) {
    const isSubmitCard = video.endpoint.includes('https://docs.google.com/forms')

    if ( isSubmitCard ) return SubmitCard

    return VideoCard
}

export default async function ( videos, options = {} ) {

    const {
        cardWidth = '325',
        classes = ''
    } = options

    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    const uid = Math.random().toString(36).substr(2, 9)
    const rowId = `row-${ uid }`

    // Setup inline scroll script
    await this.usingComponent( 'helpers/scroll.js' )

    // Setup inline lazysizes
    await this.usingComponent( 'node_modules/lazysizes/lazysizes.min.js' )

    // console.log('video', video)

    const renderedCards = await Promise.all(videos.map( async video => {
        const Card = getCardType( video )

        // console.log('Card', this.boundComponent(Card)( video ) )

        return await this.boundComponent(Card)( video )
    } ))

    const cardsHtml = renderedCards.join('')

    // console.log( 'cardsHtml', cardsHtml )

    return /* html */`

<div class="video-row relative w-full ${ classes }">

    <div
        id="${ rowId }"
        class="video-row-contents flex overflow-x-auto whitespace-no-wrap py-2 space-x-6"
        style="scroll-snap-type:x mandatory;"
    >

        ${ cardsHtml }

    </div>
    <button
        class="absolute left-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 -translate-x-1/2 bg-darker rounded-full"
        style="top:50%;"
        distance="${ cardWidth * -1 }"
        scroll-target="#${ rowId }"
        onclick="scrollHorizontalCarousel( event )"
        aria-label="Scroll to previous videos"
    >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5 text-gray-400" style="transform: scaleX(-1);">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
        </svg>
    </button>
    <button
        class="absolute right-0 h-10 w-10 flex justify-center items-center transform -translate-y-1/2 translate-x-1/2 bg-darker rounded-full"
        style="top:50%;"
        distance="${ cardWidth }"
        scroll-target="#${ rowId }"
        onclick="scrollHorizontalCarousel( event )"
        aria-label="Scroll to next videos"
    >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5 text-gray-400">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"></path>
        </svg>
    </button>

</div>

    `
}

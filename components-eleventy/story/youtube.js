export default function ( page ) {

    const {
        videoId
    } = page

    // Setup inline lazysizes
    // this.usingComponent( 'node_modules/lazysizes/lazysizes.min.js' )

    // console.log('video', video)

    return /* html */`
        <amp-youtube
            data-videoid="${ videoId }"
            layout="responsive"
            width="480"
            height="270"
        ></amp-youtube>
    `
}

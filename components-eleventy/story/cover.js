export default function ( page ) {

    const {
        heading,
        headingUrl,

        imageUrl = null,
    } = page

    // Setup inline lazysizes
    // this.usingComponent( 'node_modules/lazysizes/lazysizes.min.js' )

    // console.log('video', video)

    return /* html */`
        <amp-story-page id="jlqerrcdhz" class="jlqerrcdhz ms-st-pg"  >
            <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) -->
            <amp-story-grid-layer template="fill" class="pbxiyzxp">
                <amp-img width='720' height='1280' layout='responsive' class='pbxiyzx' id='jlqerrcdhz-bg' src='${ imageUrl }' alt='${ heading }' ></amp-img>
            </amp-story-grid-layer>
            <!-- PAGE BACKGROUND LAYER (jlqerrcdhz) ENDS -->
            <amp-story-grid-layer template="vertical" id="vsyyg" class="scrim"><div class="letterbox">
                <!-- The best therapist has fur and four legs STARTS HERE -->
                <h1 class='zegok pa' animate-in='fade-in' animate-in-duration='500ms' id='workflow-text' >${ heading }<a href='${ headingUrl }' role='link' data-tooltip-text='Details' class='story-tooltip pa' data-tooltip-icon='https://www.google.com/s2/favicons?domain=${ headingUrl }' data-vars-ctalink='${ headingUrl }' ></a></h1>
                <!-- The best therapist has fur and four legs ENDS HERE -->
            </div></amp-story-grid-layer>

        </amp-story-page>
    `
}

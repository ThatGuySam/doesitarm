import { promises as fs } from 'fs'

import Layout from '@/components/layout/default.js'

function HomebrewFormula({ payload }) {
    // const {
    //     app
    // } = payload

    return (
        <Layout>
            {/* <div className='text-9xl font-bold'>{ app.name }</div> */}
            <pre>{ JSON.stringify(payload, null, '\t') }</pre>
        </Layout>
    )
}

export async function getStaticPaths() {
    return {
        paths: [],
        fallback: 'blocking'
    }
}

export async function getStaticProps({ params }) {
    const { slug } = params

    // if (slug.length > 40 || !TWEET_ID.test(tweet)) {
    //     return { notFound: true };
    // }

    try {
        const allEndpointListings = await fs.readFile('./static/eleventy-endpoints.json', 'utf-8')
            .then( endpointsJson => {
                return JSON.parse(endpointsJson)
            })

        // console.log('endpointListings', endpointListings[0])

        let pageListing = null

        const start = '/formula/'

        for ( const listing of allEndpointListings ) {
            // if ( listing.route.includes( '/ack' ) ) {
            //     console.log('listing', listing)
            // }

            if ( !listing.route.startsWith( start ) ) continue

            if ( !listing.route.includes( slug ) ) continue

            pageListing = listing

            break
        }

        console.log('pageListing', pageListing)

        return pageListing ? { props: pageListing } : { notFound: true }
    } catch (error) {
        // The Twitter API most likely died
        console.error(error)
        return { notFound: true }
    }
}

export default HomebrewFormula

import { promises as fs } from 'fs'

import Layout from '@/components/layout/default.js'

function HomebrewFormula( props ) {
    // const {
    //     app
    // } = payload

    return (
        <Layout>
            {/* <div className='text-9xl font-bold'>{ app.name }</div> */}
            <pre>{ JSON.stringify(props, null, '\t') }</pre>
        </Layout>
    )
}

export async function getStaticPaths() {
    return {
        paths: [],
        fallback: 'blocking'
    }
}

const ONE_MINUTE = 60

const defaultStaticProps = {
    revalidate: ONE_MINUTE
}

export async function getStaticProps({ params }) {
    const { slug } = params

    // if (slug.length > 40 || !TWEET_ID.test(tweet)) {
    //     return { notFound: true, ...defaultStaticProps };
    // }

    try {
        // const allEndpointListings = await fs.readFile('./static/eleventy-endpoints.json', 'utf-8')
        //     .then( endpointsJson => {
        //         return JSON.parse(endpointsJson)
        //     })

        // const allEndpointListings = await fs.stat('./static/eleventy-endpoints.json')
        const currentDirectory = await fs.readdir('./')

        // console.log('endpointListings', endpointListings[0])

        let pageListing = {
            // allEndpointListings,
            currentDirectory
        }

        const start = '/formula/'

        // for ( const listing of allEndpointListings ) {
        //     // if ( listing.route.includes( '/ack' ) ) {
        //     //     console.log('listing', listing)
        //     // }

        //     if ( !listing.route.startsWith( start ) ) continue

        //     if ( !listing.route.includes( slug ) ) continue

        //     pageListing = listing

        //     break
        // }

        console.log('pageListing', pageListing)

        return pageListing ? {
            props: {
                ...pageListing
            },
            revalidate: ONE_MINUTE
        } : {
            notFound: true,
            props: {
                error: 'falsy pageListing'
            },
        }
    } catch (error) {
        // The Twitter API most likely died
        console.error(error)
        return {
            notFound: true,
            props: { error }
        }
    }
}

export default HomebrewFormula

import { promises as fs } from 'fs'

import Layout from '@/components/layout/default.js'

// Based on
// https://github.com/lfades/static-tweet/blob/b2a1044d881cca88e7761491d4f22c8908497d92/pages/t/%5Btweet%5D.js
// https://github.com/lfades/static-tweet
// https://github.com/chibicode/reactions/blob/master/pages/index.js

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


// https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation
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
        const dotnext = await fs.readdir('./.next')
        const server = await fs.readdir('./.next/server')
        const chunks = await fs.readdir('./.next/server/chunks')
        const staticDirectory = await fs.readdir('./.next/server/chunks/static')

        // console.log('endpointListings', endpointListings[0])

        let pageListing = {
            // allEndpointListings,
            currentDirectory,
            dotnext,
            server,
            chunks,
            staticDirectory
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

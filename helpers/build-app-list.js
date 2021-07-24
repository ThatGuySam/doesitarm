
// import { promises as fs } from 'fs'

import fs from 'fs-extra'
import MarkdownIt from 'markdown-it'
import axios from 'axios'

import statuses, { getStatusName } from './statuses.js'
import appStoreGenres from './app-store/genres.js'
import { findCategoryForTagsSet } from './categories.js'
import parseDate from './parse-date'
import { eitherMatches } from './matching.js'
import { getAppEndpoint } from './app-derived'
import { makeSlug } from './slug.js'


const md = new MarkdownIt()

const getTokenLinks = function ( childTokens ) {

    const tokenList = []

    let isLink = false

    for (const token of childTokens) {

        // On link_ switch link mode
        // link_open = true
        // link_close = false
        if (token.type.includes('link_')) isLink = !isLink

        // For link_open create a new related link in our list
        // and store thee attributes into it
        if ( isLink && token.type === 'link_open' ) {
            tokenList.push({
                ...Object.fromEntries(token.attrs)
            })
        }

        // For the text inside the link
        // store that text as the label for the link we're inside
        if ( isLink && token.type === 'text' ) {
            // Get the last pushed link
            const currentLink = tokenList[tokenList.length-1]

            // Add our text to it as a label
            tokenList[tokenList.length-1] = {
                ...currentLink,
                label: token.content
            }
        }

    }

    return tokenList
}


const lookForLastUpdated = function (app, commits) {

    for (const { node: commit } of commits) {

        // console.log('commit', commit)

        const appEndpoint = getAppEndpoint(app)

        // $$ If message body contains endpoint
        if (commit.messageBody.includes(appEndpoint)) {
            // console.log('Found', app.name ,commit.committedDate)
            return commit.committedDate
        }

        // $$ If message body contains App Name
        if (commit.messageBody.includes(app.name)) {
            // console.log('Found', app.name ,commit.committedDate)
            return commit.committedDate
        }

        // $$ If message headline contains App Name
        if (commit.messageHeadline.includes(app.name)) {
            // console.log('Found', app.name ,commit.committedDate)
            return commit.committedDate
        }

        // $$$ If commits comments contains endpoint
        for (const { node: comment } of commit.comments.edges) {
            if (comment.body.includes(appEndpoint)) {
                // console.log('Found', app.name ,commit.committedDate)
                return commit.committedDate
            }
        }

    }

    return null
}

// Fetch list of genres for each bundle
async function fetchBundleGenres () {
    const genresJsonUrl = `${process.env.VFUNCTIONS_URL}/app-store/listings-sheet?fields=bundleId,genreIds`

    return await axios.get( genresJsonUrl )
        .then( response => {
            return new Map( response.data.apps )
        })
        .catch(function (error) {
            // handle error
            console.warn('Error fetching bundle genres', error)
        })
}


function generateTagsSetFromGenres( bundleId, bundleGenres ) {
    // If we don't have this bundleID
    // then return empty
    if ( !bundleGenres.has( bundleId ) ) return new Set()

    const genres = new Set()

    bundleGenres.get( bundleId ).split(',').forEach( genreId => {
        if ( !appStoreGenres.hasOwnProperty(genreId) ) {
            console.warn('Not known genre ID', genreId)
        }

        appStoreGenres[genreId].forEach( genreName => {
            genres.add(genreName)
        })
    })

    return genres
}


export default async function () {

    const readmeContent = await fs.readFile('./README-temp.md', 'utf8')
    // console.log('readmeContent', readmeContent)

    // Fetch Commits
    const response = await axios.get(process.env.COMMITS_SOURCE)
    // Extract commit from response data
    const commits = response.data.data.viewer.repository.defaultBranchRef.target.history.edges
    // console.log('commits', commits)

    // Save commits to file just in case
    // await fs.writeFile('./commits-data.json', JSON.stringify(commits))

    const bundleGenres = await fetchBundleGenres()

    const scanListMap = new Map()

    // Store app scans
    await axios
        .get(process.env.SCANS_SOURCE)

        .then( async response => {
            const appBundles = []

            for (const appScan of response.data.appList) {

                // Add app to bundle list
                appBundles.push([
                    // bundleId as key
                    appScan.bundleIdentifier,

                    // Versions as value
                    appScan.versions
                ])

            }

            await fs.writeJson('./static/app-bundles.json', appBundles)

            return response
        })
        .then(function (response) {

            response.data.appList.forEach( appScan => {

                const appName = appScan.aliases[0]

                // 'native' or 'unreported'
                const statusName = getStatusName( appScan['Result'] )

                const statusText = (statusName === 'native') ? `✅ Yes, Full Native Apple Silicon Support reported as of v${appScan['App Version']}` : '🔶 App has not yet been reported to be native to Apple Silicon'

                const appSlug = makeSlug( appName )

                // Skip empty slugs
                if (appSlug.trim().length === 0) {
                    console.log('Empty slug', appScan)
                    return
                }

                const relatedLinks = []

                // If downloadUrl is not empty then add it as the download link
                if ( appScan['downloadUrl'] !== null ) {
                    relatedLinks.push({
                        href: appScan['downloadUrl'],
                        label: 'View',
                    })
                }

                // Add 🧪 Apple Silicon App Tested link
                relatedLinks.push({
                    label: '🧪 Apple Silicon App Tested',
                    href: 'https://doesitarm.com/apple-silicon-app-test/',
                })

                // console.log('appScan', appScan)

                const tags = generateTagsSetFromGenres( appScan.bundleIdentifier, bundleGenres )

                // Move productivity tag to the end since it's a more generic tag
                if ( tags.has('Productivity') ) {
                    tags.delete('Productivity')
                    tags.add('Productivity')
                }

                const foundCategory = findCategoryForTagsSet( tags )

                const category = {
                    label: foundCategory ? foundCategory.label : undefined,
                    slug: foundCategory ? foundCategory.slug : 'uncategorized'
                }

                // Add to scanned app list
                scanListMap.set( appSlug, {
                    name: appName,
                    aliases: appScan['aliases'],
                    bundleIds: [ appScan.bundleIdentifier ],
                    status: statusName,
                    lastUpdated: parseDate( appScan['Date'] ),
                    // url,
                    text: statusText,
                    slug: appSlug,
                    endpoint: getAppEndpoint({
                        category: {
                            slug: null
                        },
                        slug: appSlug
                    }),
                    category,
                    tags: Array.from(tags),
                    relatedLinks
                })
            })

            return
        })
        .catch(function (error) {
            // handle error
            console.warn(error)
        })


    // Parse markdown
    const result = md.parse(readmeContent)

    // console.log('results', result.length)
    // console.log('results', result)


    // Finf the end of our list
    const endOfListIndex = result.findIndex((Token) => {
        // JSON.stringify(Token).includes('end-of-list')
        const matches = Token.content.includes('end-of-list')

        // if (matches) {
        //     console.log('Token', Token)
        // }

        return matches
    })

    const appListTokens = result.slice(0, endOfListIndex)

    const appList = []

    let categorySlug = 'start'
    let categoryTitle = 'Start'
    let isHeading = false
    let isParagraph = false

    for (const token of appListTokens) {
        // On heading close switch off heading mode
        if (token.type.includes('heading_')) isHeading = !isHeading

        // On heading close switch off heading mode
        if (token.type.includes('paragraph_')) isParagraph = !isParagraph

        if (isHeading && token.type === 'inline') {
            categoryTitle = token.content
            categorySlug = makeSlug( token.content )

            // appList[categorySlug] = []
        }


        if ( isParagraph && token.type === 'inline' && token.content.includes(' - ') ) {

            const [ link, text ] = token.content.split(' - ').map(string => string.trim())

            const [ name, url ] = link.substring(1, link.length-1).split('](')

            const bundleIds = []
            let tags = []
            let aliases = []
            const relatedLinksMap = new Map( getTokenLinks(token.children).map( link => [ link.href, link ] ) )

            // Search for this app in the scanList and remove duplicates
            scanListMap.forEach( ( scannedApp, key ) => {

                for ( const alias of scannedApp.aliases ) {
                    // console.log( key, alias, name, eitherMatches(alias, name) )

                    if ( eitherMatches(alias, name) ) {
                        // If we don't have any bundleIds yet
                        // Add this app's bundleId to the list
                        if ( !bundleIds.includes( scannedApp.bundleIds[0] ) ) { bundleIds.push(scannedApp.bundleIds[0]) }

                        // Merge this scanned app's tags into the matching app
                        tags = Array.from(new Set([
                            ...tags,
                            ...scannedApp.tags
                        ]))

                        // Merge as set then convert to array to prevent duplicates
                        aliases = Array.from(new Set([
                            ...aliases,
                            ...scannedApp.aliases
                        ]))

                        // Merge relatated links
                        for ( const link of scannedApp.relatedLinks ) {

                            relatedLinksMap.set( link.href, {
                                ...link,
                                label: (link.label === 'View') ? 'App Website' : link.label
                            } )
                        }

                        console.log(`Merged ${alias} (${scannedApp.bundleIds[0]}) from scanned apps into ${name} from README`)
                        scanListMap.delete( key )
                    }
                }
            })


            // Convert link map values into array for JSON
            const relatedLinks = Array.from( relatedLinksMap.values() )

            // console.log('relatedLinks', relatedLinks)

            const appSlug = makeSlug( name )

            const endpoint = getAppEndpoint({
                category: {
                    slug: null
                },
                slug: appSlug
            })// `/app/${appSlug}`

            let status = 'unknown'

            for (const statusKey in statuses) {
                if (text.includes(statusKey)) {
                    status = statuses[statusKey]
                    break
                }
            }

            const category = {
                label: categoryTitle,
                slug: categorySlug
            }

            const lastUpdatedRaw = lookForLastUpdated({ name, slug: appSlug, endpoint, category }, commits)

            const lastUpdated = (lastUpdatedRaw) ? {
                raw: lastUpdatedRaw,
                timestamp: parseDate(lastUpdatedRaw).timestamp,
            } : null


            appList.push({
                name,
                aliases,
                status,
                bundleIds,
                lastUpdated,
                // url,
                text,
                slug: appSlug,
                endpoint,
                category,
                tags,
                // content: token.content,
                relatedLinks,
            })


            // if ( tags.length > 1 ) {
            //     console.log('tags', name, bundleIds, tags)
            // }
        }

        // appList[categorySlug]


        // console.log('token', token)
    }

    // console.log('appList', appList)


    return [
        ...appList,
        ...Array.from( scanListMap, ([name, value]) => value )
    ]

    // fs.readFile('../README.md', 'utf8')
    //     .then((err, data) => {
    //         const result = md.parse(data)
    //         console.log('result', result)

    //         return result
    //     })
}

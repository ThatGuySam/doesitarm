
import { promises as fs } from 'fs'
import MarkdownIt from 'markdown-it'
import slugify from 'slugify'
import axios from 'axios'

import statuses from './statuses'
import parseGithubDate from './parse-github-date'


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

        // $$ If message body contains endpoint
        if (commit.messageBody.includes(app.endpoint)) {
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
            if (comment.body.includes(app.endpoint)) {
                // console.log('Found', app.name ,commit.committedDate)
                return commit.committedDate
            }
        }

    }

    return null
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

    let sectionSlug = 'start'
    let sectionTitle = 'Start'
    let isHeading = false
    let isParagraph = false

    for (const token of appListTokens) {
        // On heading close switch off heading mode
        if (token.type.includes('heading_')) isHeading = !isHeading

        // On heading close switch off heading mode
        if (token.type.includes('paragraph_')) isParagraph = !isParagraph



        if (isHeading && token.type === 'inline') {
            sectionTitle = token.content
            sectionSlug = slugify(token.content, {
                lower: true,
                strict: true
            })

            // appList[sectionSlug] = []
        }


        if ( isParagraph && token.type === 'inline' && token.content.includes(' - ') ) {
            const [ link, text ] = token.content.split(' - ').map(string => string.trim())

            const relatedLinks = getTokenLinks(token.children)

            const [ name, url ] = link.substring(1, link.length-1).split('](')

            const appSlug = slugify(name, {
                lower: true,
                strict: true
            })

            const endpoint = `/app/${appSlug}`

            let status = 'unknown'

            for (const statusKey in statuses) {
                if (text.includes(statusKey)) {
                    status = statuses[statusKey]
                    break
                }
            }

            const lastUpdatedRaw = lookForLastUpdated({ name, endpoint }, commits)

            const lastUpdated = (lastUpdatedRaw) ? {
                raw: lastUpdatedRaw,
                timestamp: parseGithubDate(lastUpdatedRaw).timestamp,
            } : null


            appList.push({
                name,
                status,
                lastUpdated,
                url,
                text,
                slug: appSlug,
                endpoint,
                section: {
                    label: sectionTitle,
                    slug: sectionSlug
                },
                content: token.content,
                relatedLinks
            })
        }

        // appList[sectionSlug]


        // console.log('token', token)
    }

    // console.log('appList', appList)


    return appList

    // fs.readFile('../README.md', 'utf8')
    //     .then((err, data) => {
    //         const result = md.parse(data)
    //         console.log('result', result)

    //         return result
    //     })
}

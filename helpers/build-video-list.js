
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


const videoFeaturesApp = function (app, video) {
    const appFuzzyName = app.name.toLowerCase()
    if (video.title.toLowerCase().includes(appFuzzyName)) return true

    const appIsInTimestamps = video.timestamps.map( timestamp => timestamp.fullText.toLowerCase()).includes(appFuzzyName)

    if (appIsInTimestamps) return true

    if (video.description.toLowerCase().includes(appFuzzyName)) return true

    return false
}

export default async function ( applist ) {

    console.log('applist', applist.length)

    // Fetch Commits
    const response = await axios.get(process.env.VIDEO_SOURCE)
    // Extract commit from response data
    const fetchedVideos = response.data
    // console.log('commits', commits)

    const videos = []

    for (const videoId in fetchedVideos) {
        // Build video slug
        const slug = slugify(`${fetchedVideos[videoId].title}-${videoId}`, {
            lower: true,
            strict: true
        })

        const apps = []

        for ( const app of applist ) {
            if (videoFeaturesApp(app, fetchedVideos[videoId])) {
                apps.push(app.slug)
            }
        }

        videos.push({
            apps,
            slug,
            timestamps: fetchedVideos[videoId].timestamps,
            endpoint: `/tv/${slug}`
        })
    }

    return videos
}

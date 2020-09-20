
import { promises as fs } from 'fs'
import MarkdownIt from 'markdown-it'
import slugify from 'slugify'


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

export default async function () {

    const readmeContent = await fs.readFile('./README.md', 'utf8')

    // console.log('readmeContent', readmeContent)

    // Parse markdown
    const result = md.parse(readmeContent)

    // .map(token => {

    // })

    // console.log('results', result.length)
    // console.log('results', result)

    const appList = []

    let sectionName = 'start'
    let isHeading = false
    let isParagraph = false

    for (const token of result) {
        // On heading close switch off heading mode
        if (token.type.includes('heading_')) isHeading = !isHeading

        // On heading close switch off heading mode
        if (token.type.includes('paragraph_')) isParagraph = !isParagraph



        if (isHeading && token.type === 'inline') {
            sectionName = slugify(token.content, {
                lower: true
            })

            // appList[sectionName] = []
        }


        if ( isParagraph && token.type === 'inline' && token.content.includes(' - ') ) {
            const [ link, text ] = token.content.split(' - ').map(string => string.trim())

            const relatedLinks = getTokenLinks(token.children)

            const [ name, url ] = link.substring(1, link.length-1).split('](')

            const appSlug = slugify(name, {
                lower: true
            })

            appList.push({
                name,
                url,
                text,
                slug: appSlug,
                sectionName,
                content: token.content,
                relatedLinks
            })
        }

        // appList[sectionName]


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

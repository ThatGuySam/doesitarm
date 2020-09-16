
import { promises as fs } from 'fs'
import MarkdownIt from 'markdown-it'
import slugify from 'slugify'


const md = new MarkdownIt()

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


        if ( isParagraph && token.type === 'inline' && token.content.includes('-') ) {
            const [ link, text ] = token.content.split('-').map(string => string.trim())

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
                content: token.content
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

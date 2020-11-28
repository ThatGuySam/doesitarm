
// import { promises as fs } from 'fs'
// import MarkdownIt from 'markdown-it'
import slugify from 'slugify'
import axios from 'axios'

// import statuses from './statuses'
// import parseGithubDate from './parse-github-date'

const marked = require('marked')
const HTMLParser = require(`node-html-parser`)



const statusesTranslations = {

    // brew install -s succeeds on Apple Silicon. The software works well enough natively.
    '🥇': 'native',

    // The formula has been updated with depends_on :arch => [:x86_64, :build]. The software works well enough on Rosetta.
    '🥈': 'rosetta',

    // The formula has known issues on macOS 11, though most features work. The issues are described in the Comments field.
    '🥉': 'rosetta',

    // The formula has been updated with depends_on :arch => :x86_64. The software has been deemed to work on Intel only (for now).
    '🚫': 'no',

    // The formula has been found to need more analysis/work.
    '⚠️': 'no',

}

const statusesMessages = {
    '🥇': '✅ Yes, Full Native Apple Silicon Support',
    '🥈': '✳️ Yes, works via Rosetta 2',
    '🥉': '⏹ Known issues on macOS 11, though most features work',
    '⚠️': '⏹ No, not yet, support is still in progress',
    '🚫': '🚫 No, not yet supported only works on Intel-based Macs'
}

function getStatusText(formula) {
    // Match status to Sheet Status
    return statusesMessages[formula.status]
}

function parseStatus(formulae) {
    // Match status to Sheet Status
    return statusesTranslations[formulae.status]
}


export default async function () {

    // Fetch Homebrew
    const response = await axios.get(process.env.HOMEBREW_SOURCE)

    // Extract commit from response data
    const issueMarkdown = response.data.data.repository.issue.body

    // Parse markdown
    const issueHTML = marked(issueMarkdown)

    // Parse Markdown HTML into a dom
    const dom = HTMLParser.parse(issueHTML)


    // Map table Headings
    // [ 'Formula', 'Works1on 11.0', 'Comments' ]
    // const tableHeadings = dom.querySelectorAll('thead th').map(th => th.rawText)

    const headings = [
        'fullName',
        'status',
        'comments'
    ]

    // Map Formulae List within table
    const tableRows = dom.querySelectorAll('table tr')

    // Remove the first row (Headings)
    tableRows.shift()

    const tableRowData = tableRows.map( tr => {

        // Map Table Cells

        const cellsData = tr.querySelectorAll('td').map((td, i) => {

            const column = headings[i]

            if (td.childNodes.length === 0) return ''

            if (column === 'comments') return td.innerHTML

            return td.rawText
        })

        const formulaeRow = Object.fromEntries(cellsData.map( (cellData, i) => {
            return [ headings[i], cellData ]
        }))

        formulaeRow.name = formulaeRow.fullName.split(' ')[0]

        formulaeRow.links = tr.querySelectorAll('a').map( a => {
            const href = a.getAttribute('href')
            return {
                href,
                label: a.rawText,
                // a
            }
        })

        // if (formulaeRow.links.length !== 0) console.log('formulaeRow', formulaeRow.links)

        return formulaeRow
    })

    // console.log('dom', dom.length)
    // console.log('issueHTML', issueHTML)
    // console.log('formulaeWithStatus', formulaeWithStatus)


    const formulaeList = []


    for (const formulae of tableRowData) {

        // If this formulae status is empty
        // then skip this formulae
        if (formulae.status.length === 0) continue

        // If this formulae emoji status is not in statusesTranslations
        // then skip this formulae
        if (!statusesTranslations.hasOwnProperty(formulae.status)) continue

        // Generate slug
        const slug = formulae.name

        // slugify(formulae.name, {
        //     lower: true,
        //     strict: true
        // })

        formulaeList.push({
            name: formulae.name,
            status: parseStatus(formulae),
            // url: `https://formulae.brew.sh/formula/${formulae.name}`,
            text: getStatusText(formulae),
            slug,
            endpoint: `/formula/${slug}`,
            category: {
                slug: 'homebrew'
            },
            content: formulae.comments,
            relatedLinks: [
                {
                    href: `https://formulae.brew.sh/formula/${formulae.name}`,
                    label: formulae.name,
                    // a
                },
                ...formulae.links
            ],
            // reports: [
            //     formulae
            // ]
        })
    }

    // console.log('formulaeList', formulaeList)

    return formulaeList
}

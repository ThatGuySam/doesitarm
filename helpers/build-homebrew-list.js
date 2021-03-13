
// import { promises as fs } from 'fs'
// import MarkdownIt from 'markdown-it'
// import slugify from 'slugify'
import axios from 'axios'

// import statuses from './statuses'
// import parseDate from './parse-github-date'

const marked = require('marked')
const HTMLParser = require(`node-html-parser`)

import { getAppEndpoint } from './app-derived'


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

    '': 'unreported'
}

const statusesMessages = {
    '🥇': '✅ Yes, Full Native Apple Silicon Support',
    '🥈': '✳️ Yes, works via Rosetta 2',
    '🥉': '⏹ Known issues on macOS 11, though most features work',
    '⚠️': '⏹ No, not yet, support is still in progress',
    '🚫': '🚫 No, not yet supported only works on Intel-based Macs',
    '': '🔶 Unknown, more info needed'
}


class MakeHomebrewList {

    constructor() {
        // Data from the issue
        this.issueTableRowData = null

        // Data from the official Homebrew API
        this.allFormulaeArray = null
        this.allFormulae = null
    }

    getStatusText ( formula ) {
        // Match status to Sheet Status
        return statusesMessages[formula.status]
    }

    searchFormulaeForName (name) {
        for (const formula of this.allFormulaeArray) {
            // Check normal name
            if (formula.name === name) return formula

            // Check normal oldname
            if (formula.oldname === name) return formula

            // Check aliases
            if ((formula.aliases !== undefined) && formula.aliases.includes(name)) return formula

        }

        return null
    }

    hasArm64Formula( formulaData ) {
        // Check the official list first since it's data is newer and more frequently updated
        const hasStableFormula = (formulaData.bottle.stable !== undefined)

        return hasStableFormula && (formulaData.bottle.stable.files['arm64_big_sur'] !== undefined)
    }

    formulaIsNative (formulae) {
        // Search Formulae from Homebrew API
        const formulaData = this.allFormulae[formulae.fullName] || this.searchFormulaeForName(formulae.name)

        // console.log('formulae.fullName', formulae.fullName)

        // If this formula doesn't exist
        // then return false
        if (formulaData !== Object(formulaData)) {
            return false
        }

        // console.log('formulaData', formulaData)
        // console.log('formulae', formulae)

        // Check the official list first since it's data is newer and more frequently updated
        const hasStableFormula = (formulaData.bottle.stable !== undefined)
        const hasArm64Formula = hasStableFormula && (formulaData.bottle.stable.files['arm64_big_sur'] !== undefined)

        return this.hasArm64Formula( formulaData )
    }

    parseStatus (formulae) {
        // Match status to Sheet Status
        return statusesTranslations[formulae.status]
    }

    async make () {

        // Fetch Gihub Issue List
        const [
            issueResponse,
            allFormulaeResponse
        ] = await Promise.all([
            // Fetch Gihub Issue List
            axios.get(process.env.HOMEBREW_SOURCE),
            // Fetch Official Homebrew Formulae List
            axios.get('https://formulae.brew.sh/api/formula.json')
        ])

        // Extract commit from response data
        const issueMarkdown = issueResponse.data.data.repository.issue.body

        // Parse markdown
        const issueHTML = marked(issueMarkdown)

        // Parse Markdown HTML into a dom
        const dom = HTMLParser.parse(issueHTML)

        // Store the original array
        this.allFormulaeArray = allFormulaeResponse.data

        // Extract list from allFormulaeResponse and map into an object for easy access
        this.allFormulae = Object.fromEntries(allFormulaeResponse.data.map(formula => {
            return [
                formula.full_name,
                formula
            ]
        }))



        // console.log('allFormulae', allFormulae)


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

        this.issueTableRowData = tableRows.map( tr => {

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

            const isNativeInApi = this.formulaIsNative(formulaeRow)

            if (isNativeInApi) {
                // Update status
                formulaeRow.status = '🥇'
            }

            return formulaeRow
        })

        // console.log('dom', dom.length)
        // console.log('issueHTML', issueHTML)
        // console.log('formulaeWithStatus', formulaeWithStatus)


        const formulaeList = new Map()

        const category = {
            slug: 'homebrew'
        }


        for (const formulae of this.issueTableRowData) {

            // If this formulae status is empty
            // then skip this formulae
            // if (formulae.status.length === 0) continue

            // If this formulae emoji status is not in statusesTranslations
            // then skip this formulae
            if (!statusesTranslations.hasOwnProperty(formulae.status)) continue

            // Generate slug
            const slug = formulae.name

            // slugify(formulae.name, {
            //     lower: true,
            //     strict: true
            // })

            formulaeList.set(formulae.name, {
                name: formulae.name,
                status: this.parseStatus(formulae),
                // url: `https://formulae.brew.sh/formula/${formulae.name}`,
                text: this.getStatusText(formulae),
                slug,
                endpoint: getAppEndpoint({
                    slug,
                    category
                }),//`/formula/${slug}`,
                category,
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

        return Array.from( formulaeList , ([_, data]) =>  data )
    }
}


export default async function () {
    const maker = new MakeHomebrewList()

    return await maker.make()
}

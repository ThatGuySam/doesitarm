import fs from 'fs-extra'
import { describe, it, expect, beforeAll } from 'vitest'
import { isValidHttpUrl } from '~/helpers/check-types.js'
import { buildReadmeAppList } from '~/helpers/build-app-list.js'
import {
    matchesWholeWord,
    fuzzyMatchesWholeWord,
    eitherMatches
} from '~/helpers/matching.js'
import { PaginatedList } from '~/helpers/api/pagination.js'

require('dotenv').config()

const allowedTitleCharacters = new Set(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890 -+:_.®/\()音乐体验版'.split('')
)

/**
 * Detect Emojis(Extended Pictograph) in string
 * https://stackoverflow.com/a/64007175/1397641
 */
function hasEmoji(string) {
    return /\p{Extended_Pictographic}/u.test(string)
}

describe('README Validation', () => {
    let readmeFileContent
    let readmeAppList

    beforeAll(async () => {
        readmeFileContent = await fs.readFile('./README.md', 'utf-8')
        readmeAppList = buildReadmeAppList({
            readmeContent: readmeFileContent,
            scanListMap: new Map(),
            commits: []
        })
    })

    // User Story: As a maintainer, I want to ensure README apps are properly formatted
    describe('app formatting', () => {
        it('should have correctly formatted apps', () => {
            const foundApps = new Set()
            const invalidApps = new Set()

            for (const readmeApp of readmeAppList) {
                const cleanedAppName = readmeApp.name

                // Check for duplicates
                if (foundApps.has(cleanedAppName)) {
                    expect.fail(`Duplicate app found: ${readmeApp.name}`)
                    invalidApps.add(cleanedAppName)
                }
                foundApps.add(cleanedAppName)

                // Validate related links
                for (const relatedLink of readmeApp.relatedLinks) {
                    expect(isValidHttpUrl(relatedLink.href))
                        .toBe(true, `README App ${readmeApp.name} has invalid URL: ${relatedLink.href}`)
                }

                // Check status text formatting
                expect(readmeApp.text.includes(']('))
                    .toBe(false, `README App ${readmeApp.name} has markdown in status text`)

                // Verify emoji presence
                expect(hasEmoji(readmeApp.text))
                    .toBe(true, `README App ${readmeApp.name} does not have emoji`)

                // Validate app name characters
                for (const character of cleanedAppName) {
                    expect(allowedTitleCharacters.has(character))
                        .toBe(true, `README App Title ${readmeApp.name} has invalid character ${character}`)
                }
            }

            console.log(`${readmeAppList.length - invalidApps.size} valid apps found`)
            console.log(`${readmeAppList.length} total apps found in README`)
        })
    })

    // User Story: As a maintainer, I want apps sorted alphabetically within categories
    describe('app sorting', () => {
        it('should have apps in alphabetical order within categories', () => {
            const appsByCategory = new Map()

            // Group apps by category
            for (const readmeApp of readmeAppList) {
                const category = readmeApp.category.slug
                if (!appsByCategory.has(category)) {
                    appsByCategory.set(category, [])
                }
                appsByCategory.get(category).push(readmeApp)
            }

            // Verify sorting within categories
            for (const [category, apps] of appsByCategory) {
                const unsortedApps = [...apps]
                const sortedApps = [...apps].sort((a, b) => a.name.localeCompare(b.name))

                sortedApps.forEach((sortedApp, index) => {
                    expect(sortedApp.slug)
                        .toBe(unsortedApps[index].slug, 
                            `App at index ${index} of ${category} is out of order`)
                })
            }
        })
    })
})

// User Story: As a developer, I want to ensure special characters in names are handled correctly
describe('Name Matching', () => {
    const namesWithPlusses = ['Xournal++', 'Notepad++']

    it('should match names containing plus symbols', () => {
        for (const nameWithPlusses of namesWithPlusses) {
            const haystack = `FDKLS:KF ${nameWithPlusses}NDFLSKFLSJDK`

            expect(matchesWholeWord(nameWithPlusses, haystack)).toBe(true)
            expect(fuzzyMatchesWholeWord(nameWithPlusses, haystack)).toBe(true)
            expect(eitherMatches(nameWithPlusses, haystack)).toBe(true)
            expect(eitherMatches(haystack, nameWithPlusses)).toBe(true)
        }
    })
})

// User Story: As a developer, I want to ensure pagination works correctly
describe('Pagination', () => {
    it('should paginate lists correctly', () => {
        const testCase = {
            list: [1, 2, 3, 4, 5, 6, 7, 8, 9],
            perPage: 2,
            expectedPageCount: 5,
            expectedPages: [
                {
                    number: 1,
                    hasNextPage: true,
                    hasPreviousPage: false,
                    items: [1, 2],
                    json: '[1,2]'
                },
                {
                    number: 2,
                    hasNextPage: true,
                    hasPreviousPage: true,
                    items: [3, 4],
                    json: '[3,4]'
                },
                {
                    number: 5,
                    hasNextPage: false,
                    hasPreviousPage: true,
                    items: [9],
                    json: '[9]'
                }
            ]
        }

        const paginatedList = new PaginatedList({ 
            list: testCase.list, 
            perPage: testCase.perPage 
        })

        expect(paginatedList.pageCount)
            .toBe(testCase.expectedPageCount, 'Incorrect page count')

        testCase.expectedPages.forEach(expectedPage => {
            const actualPage = paginatedList.pages[expectedPage.number - 1]
            expect(actualPage)
                .toEqual(expectedPage, `Page ${expectedPage.number} has unexpected structure`)
        })
    })
})

import memoize from 'fast-memoize'
import memoizeGetters from 'memoize-getters'

import getListSummaryNumbers from '~/helpers/get-list-summary-numbers.js'

import {
    apiDirectory
} from '~/helpers/api/config.js'
import {
    PaginatedList,
    defaultPerPage
} from '~/helpers/api/pagination.js'

function makeKindEndpoint ({ kindSlug, number = null }) {
    if ( number ) {
        return `/kind/${ kindSlug }/${ number }`
    }

    return `/kind/${ kindSlug }`
}

function makeKindDirPath ( kindSlug ) {
    return `${ apiDirectory }${ makeKindEndpoint({ kindSlug }) }`
}

function makeKindFilePath ({ kindSlug, number }) {
    return `${ apiDirectory }${ makeKindEndpoint({ kindSlug, number }) }.json`
}


// let timeSummaryRun = 0

export class KindList extends PaginatedList {
    constructor({
        list,
        kindSlug,
        perPage = defaultPerPage
    }) {
        super({ list, perPage })

        this.kindSlug = kindSlug
    }

    baseRoute = makeKindEndpoint({ kindSlug: this.kindSlug })

    makeSummary () {
        // console.log( `Summary run ${ timeSummaryRun += 1 } times` )
        return getListSummaryNumbers( this.list )
    }

    summary = this.makeSummary()

    get routes () {
        return this.pages.map( kindPage => {
            return makeKindEndpoint({
                kindSlug: this.kindSlug,
                number: kindPage.number
            })
        })
    }

    get basePath () {
        return makeKindDirPath( this.kindSlug )
    }

    get apiFiles () {
        return this.pages.map( kindPage => {

            // If we have a number, we need to add it to the file path
            const nextPage = kindPage.hasNextPage ? makeKindEndpoint({
                kindSlug: this.kindSlug,
                number: kindPage.number + 1
            }) : ''

            return {
                path: makeKindFilePath({ kindSlug: this.kindSlug, number: kindPage.number }),
                content: {
                    nextPage,
                    summary: this.summary,
                    items: kindPage.items
                }
            }
        })
    }

}

export const KindListMemoized = memoizeGetters( KindList )

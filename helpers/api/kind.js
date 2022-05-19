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

export class KindList extends PaginatedList {
    constructor({
        list,
        kindSlug,
        perPage = defaultPerPage
    }) {
        super({ list, perPage })

        this.kindSlug = kindSlug
    }

    get baseRoute () {
        return makeKindEndpoint({ kindSlug: this.kindSlug })
    }

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
            return {
                path: makeKindFilePath({ kindSlug: this.kindSlug, number: kindPage.number }),
                content: this.list
            }
        })
    }

}

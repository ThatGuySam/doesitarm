export const defaultPerPage = 20

export class PaginatedList {
    constructor({ list, perPage = defaultPerPage }) {
        this.list = list
        this.perPage = perPage
    }

    get total () {
        return this.list.length
    }

    get pageCount () {
        return Math.ceil( this.total / this.perPage )
    }

    makePageItems ( pageNumber ) {
        const start = (pageNumber - 1) * this.perPage
        const end = start + this.perPage

        return this.list.slice(start, end)
    }

    makePage ( pageNumber ) {
        const items = this.makePageItems( pageNumber )

        return {
            number: pageNumber,
            items,
            json: JSON.stringify( items )
        }
    }

    get pages () {
        // Create an empty array of pages
        const pages = Array( this.pageCount ).fill({})

        return pages.map( ( _, index ) => {
            const pageNumber = index + 1

            return this.makePage( pageNumber )
        })
    }
}



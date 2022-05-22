export const defaultPerPage = 20


export class PaginatedList {
    constructor({ list, perPage = defaultPerPage }) {

        // Catch errors if the list is not an array or a function
        if ( !Array.isArray( list ) && typeof list !== 'function' ) {
            throw new Error(`List must be an array or a function but is ${typeof list}`)
        }

        this.listArg = list
        this.perPage = perPage
    }

    get list () {
        // if our list is a function, call it
        if ( typeof this.listArg === 'function' ) {
            return this.listArg()
        }

        return this.listArg
    }

    get total () {
        // Catch errors if the list is not an array or a function
        if ( !Array.isArray( this.list ) ) {
            throw new Error(`List must be an array or a function but is ${typeof list}`)
        }

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

    hasPage ( pageNumber ) {
        return pageNumber > 0 && pageNumber <= this.pageCount
    }

    makePage ( pageNumber ) {
        const items = this.makePageItems( pageNumber )

        return {
            number: pageNumber,
            items,
            hasNextPage: this.hasPage( pageNumber + 1 ),
            get json() {
                return JSON.stringify( items )
            }
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




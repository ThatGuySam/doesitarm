import { filterSeparator } from '~/helpers/constants.js'
import { isString } from '~/helpers/check-types.js'

export class SearchFilters {
    constructor({
        initialFilters = {}
    } = {}) {
        this.initialFilters = initialFilters

        this.filters = {
            ...initialFilters
        }
    }

    get list () {
        return Object.entries( this.filters ).map( ([ filterKey, filterValue ]) => {
            return `${ filterKey }${ filterSeparator }${ filterValue }`
        } )
    }

    get asQuery () {
        return this.list.join(' ')
    }

    get asPagefindFilters () {
        return Object.fromEntries( Object.entries( this.filters ).map( ([ filterKey, filterValue ]) => {
            return [ filterKey, [ filterValue ] ]
        }) )
    }

    getByKey ( key ) {
        return `${ key }${ filterSeparator }${ this.filters[ key ] }`
    }

    isQueryValue ( filterNameOrQueryValue ) {
        return filterNameOrQueryValue.includes( filterSeparator )
    }

    getKeyAndValue ( filterQueryValue ) {
        const key = filterQueryValue.substring(0, filterQueryValue.indexOf( filterSeparator ))
        const value = filterQueryValue.substring(filterQueryValue.indexOf( filterSeparator )+1)

        return { key, value }
    }

    getFilterNameAndValueFromString ( filterNameOrQueryValue ) {
        if ( this.isQueryValue( filterNameOrQueryValue ) ) {
            return this.getKeyAndValue( filterNameOrQueryValue )
        }

        return {
            key: filterNameOrQueryValue,
            value: null
        }
    }

    remove ( filterName ) {
        if ( this.isQueryValue( filterName ) ) throw new Error(`${ filterName } is not a valid filter name`)

        delete this.filters[ filterName ]
    }

    setFromStringArray ( filterStringArray ) {
        filterStringArray.forEach( filterString => {
            const { key, value } = this.getFilterNameAndValueFromString( filterString )

            this.filters[ key ] = value
        })
    }

    setFromString ( filterNameOrQueryValue ) {
        const {
            key,
            value = ''
        } = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        if ( value.trim().length === 0 ) throw new Error(`${ filterNameOrQueryValue } is not a valid filter value`)

        this.set( key, value )
    }

    set ( filterName, filterValue ) {
        if ( this.isQueryValue( filterName ) ) throw new Error(`${ filterName } is not a valid filter name`)

        this.filters[ filterName ] = filterValue
    }

    toggleFilter ( filterNameOrQueryValue, filterValue = null ) {
        const fromString = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        const filterName = fromString.key
        filterValue = filterValue || fromString.value

        if ( this.has( filterNameOrQueryValue ) ) {
            this.remove( filterName )

            return
        }

        if ( typeof filterValue !== 'string' ) {
            throw new Error(`Filter value must be a string. Got ${ typeof filterValue }`)
        }

        this.set( filterName, filterValue )
    }

    has ( filterNameOrQueryValue ) {
        const {
            key : filterName,
            value : filterValue = null
        } = this.getFilterNameAndValueFromString( filterNameOrQueryValue )

        if ( isString( filterValue ) ) {
            return !!this.filters[ filterName ] && this.filters[ filterName ] === filterValue
        }

        return !!this.filters[ filterName ]
    }
}

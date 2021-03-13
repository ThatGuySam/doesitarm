// Universal JS imports only
import { getAppCategory } from './categories.js'


// Converts a list into a smaller searchable list
// similar to a table/spreadsheet
export function makeSearchableList ( listSet ) {
    let firstLoop = true

    const searchableList = new Set()

    const tableHeader = new Set()

    // const searchableKeys = new Set([
    //     'name',
    //     'text',
    //     'lastUpdated',
    //     'endpoint'
    // ])

    const makeSearchable = new Map([
        [
            'name',
            item => {
                // console.log('Running name method', item)
                return item.name
            }
        ],
        [
            'text',
            item => item.text
        ],
        [
            'endpoint',
            item => item.endpoint
        ],
        [
            'category',
            app => {
                return getAppCategory( app ).id
            }
        ]
    ])

    listSet.forEach( ( searchableItem ) => {
        // If this is the first items
        // then store the keys
        if ( firstLoop ) {
            Object.keys(searchableItem).forEach( key => {
                // console.log(key, makeSearchable.has(key))

                if ( !makeSearchable.has(key) ) return

                // Add to table header so we can loop it later on
                tableHeader.add( key )
            })

            // Add keys to table head
            searchableList.add( Array.from( tableHeader ) )

            firstLoop = false
        }
        // This could cause an issue if the keys
        // are out of order

        // console.log('tableHeader', tableHeader)

        const tableRow = []

        // Loop through keys from table header
        // and push them to this row
        tableHeader.forEach( key => {
            // console.log('searchableValue', key, searchableItem[key], makeSearchable.get(key)(searchableItem) )

            tableRow.push( makeSearchable.get(key)(searchableItem) )
        })

        searchableList.add( tableRow )

        return
    })

    return searchableList
}

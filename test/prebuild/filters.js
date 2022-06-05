import test from 'ava'
// import MarkdownIt from 'markdown-it'

// import { isValidHttpUrl } from '~/helpers/check-types.js'
import { StorkFilters } from '~/helpers/stork/browser.js'


require('dotenv').config()


test('Can Toggle off existing filter' , async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'yes'
        }
    })

    filters.toggleFilter('test')

    t.deepEqual(filters.hasFilter('test'), false)

    filters.toggleFilter('test', 'yes')
    filters.toggleFilter('status', 'native')

    t.deepEqual(filters.hasFilter('test'), true, 'Has test filter')

    t.deepEqual(filters.filtersForQuery, 'test_yes status_native', 'Has correct filters for query')

    filters.toggleFilter('status_native')

    t.deepEqual(filters.filtersForQuery, 'test_yes', 'Has only test filter')
})


test('Can handle query values with multiple underscores', async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'value_with_multiple_underscores'
        }
    })

    t.log( 'filters.filtersForQuery', filters.filtersForQuery )

    t.assert( filters.hasFilter( 'test_value_with_multiple_underscores' ) , 'Has correct filters for query' )
})


test( 'Can update existing filter', async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'works_no'
        }
    })

    filters.toggleFilter('test_works_yes')

    t.deepEqual( filters.filtersForQuery, 'test_works_yes', 'Has updated filter')
})




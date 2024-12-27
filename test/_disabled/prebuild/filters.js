import test from 'ava'
// import MarkdownIt from 'markdown-it'

// import { isValidHttpUrl } from '~/helpers/check-types.js'
import { StorkFilters } from '~/helpers/stork/browser.js'


test('Can Toggle off existing filter' , async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'yes'
        }
    })

    filters.toggleFilter('test')

    t.deepEqual(filters.has('test'), false)

    filters.toggleFilter('test', 'yes')
    filters.toggleFilter('status', 'native')

    t.deepEqual(filters.has('test'), true, 'Has test filter')

    t.deepEqual(filters.asQuery, 'test_yes status_native', 'Has correct filters for query')

    filters.toggleFilter('status_native')

    t.deepEqual(filters.asQuery, 'test_yes', 'Has only test filter')
})


test('Can handle query values with multiple underscores', async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'value_with_multiple_underscores'
        }
    })

    t.log( 'filters.asQuery', filters.asQuery )

    t.assert( filters.has( 'test_value_with_multiple_underscores' ) , 'Has correct filters for query' )
})


test( 'Can update existing filter', async t => {
    const filters = new StorkFilters({
        initialFilters: {
            'test': 'works_no'
        }
    })

    filters.toggleFilter('test_works_yes')

    t.deepEqual( filters.asQuery, 'test_works_yes', 'Has updated filter')
})


test( 'Can set filters from string', async t => {
    const filters = new StorkFilters()

    filters.setFromString( 'test_works_yes' )

    t.deepEqual( filters.asQuery, 'test_works_yes', 'Has updated filter')
})

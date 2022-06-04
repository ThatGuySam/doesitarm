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

    t.deepEqual(filters.hasFilter('test'), true)

    t.deepEqual(filters.filtersForQuery, 'test_yes status_native')

    filters.toggleFilter('status_native')

    t.deepEqual(filters.filtersForQuery, 'test_yes')
})


// Can handle query values with multiple underscores

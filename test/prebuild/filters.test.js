import { describe, it, expect, beforeEach } from 'vitest'
import { StorkFilters } from '~/helpers/stork/browser.js'

/**
 * Tests for StorkFilters class which handles filter management and query string 
 * generation for Stork search
 */
describe('StorkFilters', () => {
    // let filters

    // beforeEach(() => {
    //     filters = new StorkFilters()
    // })

    // User Story: As a user, I want to toggle filters on/off so I can refine my search
    describe('filter toggling', () => {
        it('should toggle off an existing filter', () => {
            const filters = new StorkFilters({
                initialFilters: { test: 'yes' }
            })

            filters.toggleFilter('test')
            expect(filters.has('test')).toBe(false)
        })

        it('should toggle on multiple filters', () => {
            const filters = new StorkFilters({
                initialFilters: { test: 'yes' }
            })

            // filters.toggleFilter('test', 'yes')
            filters.toggleFilter('status', 'native')

            expect(filters.has('test')).toBe( true )
            expect(filters.asQuery).toBe('test_yes status_native')
        })

        it('should remove a specific filter', () => {
            const filters = new StorkFilters({
                initialFilters: { 
                    test: 'yes',
                    status: 'native'
                }
            })

            filters.toggleFilter('status_native')
            expect(filters.asQuery).toBe('test_yes')
        })
    })

    // User Story: As a user, I want to use complex filter values to enable detailed searching
    describe('complex filter values', () => {
        it('should handle values with multiple underscores', () => {
            const filters = new StorkFilters({
                initialFilters: {
                    test: 'value_with_multiple_underscores'
                }
            })

            expect(filters.has('test_value_with_multiple_underscores')).toBe(true)
        })

        it('should update existing filter value', () => {
            const filters = new StorkFilters({
                initialFilters: {
                    test: 'works_no'
                }
            })

            filters.toggleFilter('test_works_yes')
            expect(filters.asQuery).toBe('test_works_yes')
        })
    })

    // User Story: As a user, I want to set filters from a query string to restore search state
    describe('filter initialization', () => {
        it('should set filters from query string', () => {
            const filters = new StorkFilters({
                initialFilters: {
                    test: 'works_no'
                }
            })

            filters.setFromString('test_works_yes')
            expect(filters.asQuery).toBe('test_works_yes')
        })
    })
})

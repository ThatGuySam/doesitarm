import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

export function makeSubscriptionsDatabase () {
    const sqlite = new DatabaseSync( ':memory:' )
    const migrations = new URL( '../../workers/subscriptions/migrations/', import.meta.url )

    for ( const file of readdirSync( migrations ).filter( file => file.endsWith( '.sql' ) ).sort() ) {
        sqlite.exec( readFileSync( new URL( file, migrations ), 'utf8' ) )
    }

    const database = {
        prepare ( sql ) {
            const statement = sqlite.prepare( sql )
            let parameters = []

            return {
                bind ( ...values ) {
                    if ( /\?\d+/.test( sql ) ) {
                        parameters = [Object.fromEntries( values.map( ( value, index ) => [`?${index + 1}`, value] ) )]
                    } else {
                        parameters = values
                    }
                    return this
                },
                async first () {
                    return statement.get( ...parameters ) || null
                },
                async all () {
                    return { results: statement.all( ...parameters ), success: true }
                },
                run () {
                    if ( statement.columns().length ) {
                        return { results: statement.all( ...parameters ), success: true }
                    }
                    const { changes } = statement.run( ...parameters )
                    return { meta: { changes }, results: [], success: true }
                }
            }
        },
        async batch ( statements ) {
            sqlite.exec( 'BEGIN' )
            try {
                const results = statements.map( statement => statement.run() )
                sqlite.exec( 'COMMIT' )
                return results
            } catch ( error ) {
                sqlite.exec( 'ROLLBACK' )
                throw error
            }
        }
    }

    return { database, sqlite }
}

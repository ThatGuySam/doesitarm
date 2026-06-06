// import { statuses } from './build-app-list'
import { fileURLToPath } from 'node:url'

import fs from 'fs-extra'

import { getAppEndpoint } from './app-derived'
import { makeSlug } from './slug.js'


// console.log('process.env.GAMES_SOURCE', process.env.GAMES_SOURCE)
export const gamesSnapshotCsvPath = fileURLToPath( new URL( '../docs/tosh-games-6-6-26.csv', import.meta.url ) )

// export const statuses = {
//     '✅': 'native',
//     '✳️': 'rosetta',
//     '⏹': 'no-in-progress',
//     '🚫': 'no'
// }

const statusesTranslations = {
    'Native': 'native',
    'Rosetta 2': 'rosetta',
    '': 'unreported'
    // 'CrossOver': 'rosetta',
    // '': 'no'
}

const statusesMessages = {
    'Native': '✅ Yes, Native Apple Silicon Support',
    'Rosetta 2': '✳️ Yes, works via Rosetta 2',
    // 'CrossOver': '✳️ Yes, works via Rosetta 2',
    // 'no': '🚫 No, not yet supported only works on Intel-based Macs'
}

function isUnknown(game) {
    const playableStatus = game.Playable.toLowerCase()
    return ![
        'yes',
        'no'
    ].includes(playableStatus)
}

function isPlayable(game) {
    return game.Playable.toLowerCase() === 'yes'
}

function environmentName(game) {
    return game['Environment'].trim()
}


function getStatusText(game) {
    if (isUnknown(game)) return '🔶 Unknown, more info needed'

    if (isPlayable(game) === false) return '🚫 No, not yet supported only works on Intel-based Macs'

    // Match status to Sheet Status
    return statusesMessages[environmentName(game)]
}


function parseStatus(game) {
    if (isUnknown(game)) return 'unreported'

    if (isPlayable(game) === false) return 'no'

    // Match status to Sheet Status
    return statusesTranslations[environmentName(game)]
}

function parseCsvRows ( csv ) {
    const rows = []
    let row = []
    let cell = ''
    let isQuoted = false

    for ( let index = 0; index < csv.length; index += 1 ) {
        const character = csv[ index ]
        const nextCharacter = csv[ index + 1 ]

        if ( character === '"' ) {
            if ( isQuoted && nextCharacter === '"' ) {
                cell += '"'
                index += 1
                continue
            }

            isQuoted = !isQuoted
            continue
        }

        if ( character === ',' && !isQuoted ) {
            row.push( cell )
            cell = ''
            continue
        }

        if ( ( character === '\n' || character === '\r' ) && !isQuoted ) {
            if ( character === '\r' && nextCharacter === '\n' ) {
                index += 1
            }

            row.push( cell )
            rows.push( row )
            row = []
            cell = ''
            continue
        }

        cell += character
    }

    if ( cell.length > 0 || row.length > 0 ) {
        row.push( cell )
        rows.push( row )
    }

    return rows
}

function isBlankRow ( row ) {
    return row.every( cell => cell.trim().length === 0 )
}

function findGamesHeaderRowIndex ( rows ) {
    return rows.findIndex( row => row[ 0 ] === 'Games' && row[ 1 ] === 'Playable' )
}

function mapCsvRowToRecord ( headers, row ) {
    return headers.reduce( ( record, header, index ) => {
        const normalizedHeader = header.trim()

        if ( normalizedHeader.length === 0 ) return record

        record[ normalizedHeader ] = row[ index ] || ''

        return record
    }, {} )
}

export async function loadGamesSnapshot () {
    const csv = await fs.readFile( gamesSnapshotCsvPath, 'utf8' )
    const rows = parseCsvRows( csv )
    const headerRowIndex = findGamesHeaderRowIndex( rows )

    if ( headerRowIndex === -1 ) {
        throw new Error( `Could not find Games header row in ${ gamesSnapshotCsvPath }` )
    }

    const headers = rows[ headerRowIndex ]

    return rows
        .slice( headerRowIndex + 1 )
        .filter( row => !isBlankRow( row ) )
        .filter( row => row[ 0 ]?.trim().length > 0 )
        .map( row => mapCsvRowToRecord( headers, row ) )
}

export default async function () {

    const gamesSheet = await loadGamesSnapshot()

    const gameList = []

    // console.log('gamesSheet', gamesSheet)

    for (const game of gamesSheet) {

        // If there's no title
        // then skip this report
        if (game.Games.length === 0) continue

        // If there's no 'Environment' status
        // then skip this report
        if (environmentName(game).length === 0) continue

        // If this game is playable
        // BUT it's 'Environment' status is not in statusesTranslations
        // then skip this report
        if (isPlayable(game) && statusesTranslations.hasOwnProperty(environmentName(game)) === false) continue

        // Generate slug
        const slug = makeSlug( game.Games )

        // Find index of game is list so far
        const gameIndex = gameList.findIndex(game => {
            return game.slug === slug
        })

        // Game already has entry
        if (gameIndex !== -1) {

            // console.log('Existing Game', game)

            gameList[gameIndex].reports.push(game)

            continue
        }


        const status = parseStatus(game)

        if (typeof status !== 'string') {
            console.warn('Non-string status', game)

            continue
        }

        const category = {
            slug: 'games'
        }

        gameList.push({
            name: game.Games,
            status,
            // url: `https://rawg.io/search?query=${encodeURIComponent(game.Games)}`,
            text: getStatusText(game),
            slug,
            endpoint: getAppEndpoint({
                slug,
                category
            }),//`/game/${slug}`,
            category,
            content: '',
            // relatedLinks: [],
            reports: [
                game
            ]
        })

    }

    // console.log('gameList', gameList)


    return gameList

    // fs.readFile('../README.md', 'utf8')
    //     .then((err, data) => {
    //         const result = md.parse(data)
    //         console.log('result', result)

    //         return result
    //     })
}

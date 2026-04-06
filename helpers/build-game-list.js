// import { statuses } from './build-app-list'
import { getAppEndpoint } from './app-derived'
import { makeSlug } from './slug.js'
import { getJson } from './http.js'


// console.log('process.env.GAMES_SOURCE', process.env.GAMES_SOURCE)

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

export default async function () {

    // Fetch Sheet data
    const gamesSheet = await getJson( process.env.GAMES_SOURCE )
        .then(function (response) {
            // handle success
            return response.records
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        })

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

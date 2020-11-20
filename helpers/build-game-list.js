
import { promises as fs } from 'fs'
import slugify from 'slugify'
import axios from 'axios'

// import { statuses } from './build-app-list'


// console.log('process.env.GAMES_SOURCE', process.env.GAMES_SOURCE)

// export const statuses = {
//     '✅': 'native',
//     '✳️': 'rosetta',
//     '⏹': 'no-in-progress',
//     '🚫': 'no'
// }

const statusesTranslations = {
    'Native': 'native',
    'Rosetta': 'rosetta',
    // '': 'no'
}

const statusesMessages = {
    'native': '✅ Yes, Full Native Apple Silicon Support',
    'rosetta': '✳️ Yes, works via Rosetta 2',
    'no': '🚫 No, not yet supported only works on Intel-based Macs'
}


function parseStatus(game) {
    if (game.Playable === 'no') return 'no'

    // Match status to Sheet Status
    return statusesTranslations[game['Native/Rosetta']]
    // for (const statusKey in statusesTranslations) {
    //     console.log("game['Native/Rosetta']", game['Native/Rosetta'])
    //     console.log('statuses[statusKey]', statusesTranslations[game['Native/Rosetta']])
    //     if (game['Native/Rosetta'].includes(statusKey)) {
    //         return statusesTranslations[statusKey]
    //     }
    // }
}

export default async function () {

    // Fetch Sheet data
    const gamesSheet = await axios
        .get(process.env.GAMES_SOURCE)
        .then(function (response) {
            // handle success
            return response.data.records
        })
        .catch(function (error) {
            // handle error
            console.log(error);
        })

    const gameList = []

    // console.log('gamesSheet', gamesSheet)

    for (const game of gamesSheet) {

        // If there's no title
        // then stop
        if (game.Games.length === 0) continue

        // If there's no 'Native/Rosetta' status
        // then stop
        if (game['Native/Rosetta'].length === 0) continue

        // Generate slug
        const slug = slugify(game.Games, {
            lower: true,
            strict: true
        })

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

        gameList.push({
            name: game.Games,
            status,
            url: `https://rawg.io/search?query=${encodeURIComponent(game.Games)}`,
            text: statusesMessages[status],
            slug,
            endpoint: `/game/${slug}`,
            section: {
                label: 'Games',
                slug: 'games'
            },
            content: '',
            relatedLinks: [
                {
                    "href": `https://rawg.io/search?query=${encodeURIComponent(game.Games)}`,
                    "label": "View"
                }
            ],
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

import appList from '~/static/app-list.json'
import gameList from '~/static/game-list.json'
import homebrewList from '~/static/homebrew-list.json'

import { byTimeThenNull } from '~/helpers/sort-list.js'
import { videosRelatedToApp } from '~/helpers/related.js'
import { getAppEndpoint } from '~/helpers/app-derived.js'


export const allVideoAppsList = [
    ...appList.sort(byTimeThenNull),
    ...gameList,
]

export const sortedAppList = appList.sort(byTimeThenNull)

export const allList = [
    ...sortedAppList,
    ...homebrewList,
    ...gameList,
]


export function makeAppSearchLinks ( app, videoListSet ) {

    const videos = videosRelatedToApp( app, videoListSet )

    // If there are no videos
    // then skip
    if (videos.length === 0) return []

    const searchLinks = []

    const appBenchmarksUrl = `${getAppEndpoint(app)}/benchmarks`

    let hasPerformanceVideo = false

    for (const video of videos) {
        // If there are no video tags
        // then skip
        if (video.tags.length === 0) continue

        // If there's any benchmark video then add
        if (video.tags.includes('benchmark')) {
            // Add a benchmark link
            searchLinks.push({
                href: appBenchmarksUrl,
                label: 'Benchmarks'
            })

            // then stop looking
            break
        }

        if (video.tags.includes('performance')) {
            hasPerformanceVideo = true
        }
    }

    // If there was no bechmark video found
    // but there was a performance video found
    // then push Performance link
    if (searchLinks.length === 0 && hasPerformanceVideo) {
        // Add a performance link
        searchLinks.push({
            href: appBenchmarksUrl,
            label: 'Performance'
        })
    }

    return searchLinks
}

import appList from '~/static/app-list.json'
import gameList from '~/static/game-list.json'
import homebrewList from '~/static/homebrew-list.json'

import { byTimeThenNull } from '~/helpers/sort-list.js'

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

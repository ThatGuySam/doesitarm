import {
    downloadStorkExecutable,
    buildIndex
} from '~/helpers/stork/executable.js'

;(async () => {
    await downloadStorkExecutable()

    await buildIndex()

    process.exit()
})()

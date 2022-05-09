import {
    downloadStorkToml
} from '~/helpers/api/static.js'

;(async () => {
    await downloadStorkToml()

    process.exit()
})()

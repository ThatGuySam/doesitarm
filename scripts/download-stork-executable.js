import { downloadStorkExecutable } from '~/helpers/stork/executable.js'

;(async () => {
    await downloadStorkExecutable()

    process.exit()
})()

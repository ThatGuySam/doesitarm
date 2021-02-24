const fs = require('fs-extra')
const path = require('path')
const { exec } = require("child_process")

const isProduction = process.env.NODE_ENV === 'PRODUCTION'

const CACHE_PATH = isProduction
    ? path.join('/', 'opt', 'build', 'cache', 'nuxt_build') // Netlify cache path
    : path.resolve(__dirname, '.nuxt_build')

const BUILD_PATH = path.resolve(__dirname, '.nuxt')

async function putNuxtClientBack() {
    const exists = await fs.pathExists(CACHE_PATH)
    if (exists) {
        console.log("cache found")
        await fs.copy(CACHE_PATH, BUILD_PATH)
        exec('nuxt generate --no-build', (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    } else {
        console.log("no cache")
        exec('npm run generate', (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
        });
    }
}

;(async () => {
    await putNuxtClientBack()

})()

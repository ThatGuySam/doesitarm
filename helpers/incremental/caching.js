import { promises as fs } from 'fs'

const TOML = require('@iarna/toml')


export async function getNetlifyConfig () {
    const netlifyTomlContents = await fs.readFile('./netlify.toml', 'utf-8')

    // console.log('netlifyTomlContent', netlifyTomlContents)

    return TOML.parse( netlifyTomlContents )
}

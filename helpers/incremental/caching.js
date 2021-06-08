import { promises as fs } from 'fs'

import { default as TOML } from '@iarna/toml'



export async function getNetlifyConfig () {
    const netlifyTomlContents = await fs.readFile('./netlify.toml', 'utf-8')

    // console.log('netlifyTomlContent', netlifyTomlContents)

    return TOML.parse( netlifyTomlContents )
}

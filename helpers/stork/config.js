import { config } from '~/package.json'


export const storkOptions = config.stork
export const storkVersion = '1.6.0'

// Stork 2.0
// export const storkVersion = '2.0.0-beta.1'

export const storkExecutableName = storkOptions.executable
export const storkExecutablePath = `./${ storkExecutableName }`
export const storkTomlPath = storkOptions.toml
export const storkIndexPath = storkOptions.index

export const storkIndexRelativeURL = storkIndexPath.replace('static/', '/')
export const storkScriptURL = `https://files.stork-search.net/releases/v${ storkVersion }/stork.js`

import { config } from '~/package.json'


export const storkOptions = config.stork
export const storkVersion = '1.4.2'

export const storkExecutableName = storkOptions.executable
export const storkExecutablePath = `./${ storkExecutableName }`
export const storkTomlPath = storkOptions.toml
export const storkIndexPath = storkOptions.binary

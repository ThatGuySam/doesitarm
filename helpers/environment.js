import path from 'path'



export const isProduction = process.env.NODE_ENV === 'PRODUCTION'

// https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
export const isNetlify = process.env.NETLIFY === true

export const rootDir = path.resolve(__dirname, '../')

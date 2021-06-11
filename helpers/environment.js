import path from 'path'



export const isProduction = process.env.NODE_ENV === 'PRODUCTION'

export const isNetlify = process.env.NETLIFY === true

export const rootDir = path.resolve(__dirname, '../')

import path from 'path'



export const isProduction = process.env.NODE_ENV === 'PRODUCTION'

export const rootDir = path.resolve(__dirname, '../')

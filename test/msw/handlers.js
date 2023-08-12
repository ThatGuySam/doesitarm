import fs from 'fs/promises'

import { rest } from 'msw'

export const handlers = [
    rest.get('https://mock.msw/*', async (req, res, ctx) => {
        // const { endpoint } = req.params;
        const urlPath = req.url.pathname

        const fileContent = await fs.readFile( `./static/${urlPath}`, 'utf8')

        return res(ctx.json(JSON.parse(fileContent)))
    }),
];
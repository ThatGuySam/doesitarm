import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import postcss from 'postcss'
import tailwind from 'tailwindcss'

const require = createRequire(import.meta.url)
const config = require('../../tailwind.config.js')
const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

// Use the real headline markup, global styles, container config, and bundled font.
export async function statusHeadlineFixture () {
    const [readme, component, globalCss, headlineCss, fontCss] = await Promise.all([
        read('../../README.md'), read('../../src/components/default-listing.astro'),
        read('../../assets/css/tailwind.css'), read('../../assets/css/status-headline.css'),
        read('../../node_modules/@fontsource/inter/variable.css')
    ])
    const statuses = readme.split('end-of-list')[0].split('\n')
        .filter(line => /^\* \[.+\]\(.+\) - /.test(line))
        .map(line => ({ name: line.slice(3, line.indexOf('](')), text: line.split(' - ')[1].trim() }))
    const opening = component.match(/<h2\b[^>]*>/)[0]
    const html = `<section class="container"><div class="intro-content flex flex-col items-center text-center gap-8">${statuses.map(({ name, text }) =>
        `<article style="width:100%" data-app="${escape(name)}">${opening}${escape(text)}</h2></article>`).join('')}</div></section>`
    const styles = await postcss([tailwind({ ...config, content: [{ raw: html, extension: 'html' }] })])
        .process(`@tailwind base;\n@tailwind utilities;\n${globalCss.replace(/^@import .*$/gm, '')}\n${headlineCss}`, { from: undefined })
    let fonts = fontCss
    for (const [, path] of fontCss.matchAll(/url\(['"]?(\.\/files\/[^)'" ]+)['"]?\)/g)) {
        const bytes = await readFile(new URL(`../../node_modules/@fontsource/inter/${path}`, import.meta.url))
        fonts = fonts.replaceAll(path, `data:font/woff2;base64,${bytes.toString('base64')}`)
    }
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fonts}\n${styles.css}</style></head><body>${html}</body></html>`
}

// Count actual text line rectangles so hidden overflow/clamping cannot fake a pass.
export function measureStatusHeadlines () {
    return [...document.querySelectorAll('[data-testid="status-headline"]')].map(el => {
        const range = document.createRange()
        range.selectNodeContents(el)
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0)
        const tops = new Set(rects.map(rect => Math.round(rect.top)))
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
            name: el.closest('[data-app]')?.getAttribute('data-app'),
            text: el.textContent,
            lines: tops.size,
            clipped: rects.some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1),
            hidden: style.overflow === 'hidden' || style.textOverflow === 'ellipsis' || !['none', ''].includes(style.webkitLineClamp),
            overflow: el.scrollWidth > el.clientWidth + 1
        }
    })
}

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const [url, prefix = 'review'] = process.argv.slice(2)
if (!url) throw new Error('Pass the full URL of the UI review page.')

const screenshots = fileURLToPath(new URL('../../docs/shadcn-ui/screenshots/', import.meta.url))
await mkdir(screenshots, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || '/usr/bin/chromium',
  headless: true,
})
const viewports = {
  desktop: { width: 1440, height: 1000 },
  phone: { width: 390, height: 844 },
}

try {
  for (const [size, viewport] of Object.entries(viewports)) {
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const response = await page.goto(url)
    if (response?.status() !== 200) throw new Error(`Review returned ${response?.status()}.`)
    await page.getByRole('heading', { level: 1, name: 'UI review' }).waitFor()
    await page.evaluate(() => document.fonts.ready)

    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({
      path: new URL(entry.name).pathname,
      transfer: entry.transferSize,
      encoded: entry.encodedBodySize,
      decoded: entry.decodedBodySize,
    })).filter(entry => entry.path.startsWith('/ui-assets/')))
    console.log(`${size} initial review resources`, JSON.stringify(resources))

    const toc = page.getByRole('navigation', { name: 'Table of contents' })
    for (const theme of ['dark', 'light']) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: join(screenshots, `${prefix}-atoms-${theme}-${size}.png`), animations: 'disabled' })
      for (const [section, label] of Object.entries({ components: 'Components', compositions: 'Compositions', 'does-it-arm': 'Does It ARM' })) {
        await toc.getByRole('link', { name: label, exact: true }).click()
        if (section === 'compositions') {
          const frame = page.frameLocator('.review-composition-frame')
          await frame.getByRole('main', { name: 'Component preview' }).waitFor()
          await frame.getByText('Loading preview…', { exact: true }).waitFor({ state: 'hidden' })
        }
        if (section === 'does-it-arm') await page.getByRole('button', { name: 'View scan details', exact: true }).waitFor()
        await page.screenshot({ path: join(screenshots, `${prefix}-${section}-${theme}-${size}.png`), animations: 'disabled' })
      }
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to light theme' }).click()
    }
    await page.close()
    if (errors.length) throw new Error(`${size} browser errors\n${errors.join('\n')}`)
  }
} finally {
  await browser.close()
}

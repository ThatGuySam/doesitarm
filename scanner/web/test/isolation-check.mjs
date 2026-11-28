// The scanner must look the same standalone and inside the site layout (site resets cannot leak in), and the
// scanner must not restyle the site (its rules are all under .dia-scanner). Usage: node test/isolation-check.mjs [--url LIVE_V3_URL]
import { chromium } from 'playwright-core';
import { startPreview } from '../scripts/serve.mjs';
import { liveSiteHtml } from './padding-check.mjs';

const PROPS = ['display', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'marginTop', 'marginBottom',
  'marginLeft', 'marginRight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'borderRadius', 'width', 'height', 'textAlign', 'textDecorationLine', 'listStyleType', 'boxShadow', 'letterSpacing'];

function snapshot({ selector, PROPS }) {
  const root = document.querySelector(selector);
  const rows = [];
  for (const el of root.querySelectorAll('*')) {
    if (!el.checkVisibility() || el.closest('.scanner-switch')) continue;
    const style = getComputedStyle(el);
    rows.push([el.localName + (el.id ? `#${el.id}` : '') + `.${[...el.classList].join('.')}`, Object.fromEntries(PROPS.map((name) => [name, style[name]]))]);
  }
  const siteProbe = Object.fromEntries(['.app-wrapper', 'nav', 'footer'].map((q) => {
    const el = document.querySelector(q);
    return [q, el ? ['fontSize', 'color', 'padding', 'margin', 'display'].map((p) => getComputedStyle(el)[p]).join('|') : null];
  }));
  return { rows, siteProbe, rootFont: getComputedStyle(document.documentElement).fontSize };
}

const liveUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
const preview = await startPreview({ fromSource: true, siteHtml: liveSiteHtml });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const take = async (url) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('doesitarm.scanner.view.v1', JSON.stringify({ level: 'research' })));
  await page.goto(url);
  await page.locator('#files').waitFor({ state: 'attached' });
  await page.waitForTimeout(400);
  const result = await page.evaluate(snapshot, { selector: '.dia-scanner', PROPS });
  await page.close();
  return result;
};
let failures = 0;
try {
  const standalone = await take(preview.url);
  const embedded = await take(liveUrl ?? `${preview.url}/layout/`);
  if (standalone.rows.length !== embedded.rows.length) { failures++; console.log(`element count differs: ${standalone.rows.length} vs ${embedded.rows.length}`); }
  for (let i = 0; i < Math.min(standalone.rows.length, embedded.rows.length); i++) {
    for (const prop of PROPS) {
      const a = standalone.rows[i][1][prop];
      const b = embedded.rows[i][1][prop];
      if (a !== b) { failures++; if (failures < 40) console.log(`${standalone.rows[i][0]} ${prop}: standalone ${a} vs embedded ${b}`); }
    }
  }
  console.log(`root font: standalone ${standalone.rootFont}, embedded ${embedded.rootFont}`);
  console.log(`${standalone.rows.length} elements compared, ${failures} differences`);
} finally {
  await browser.close();
  preview.server.closeAllConnections();
  preview.server.close();
}
process.exit(failures ? 1 : 0);

import { emulateMac } from '../test/browser-helpers.mjs';
// Headless accessibility basics for the scanner page: keyboard order, names, target sizes,
// disclosure keys, dialog focus handling, 390 px reflow and colour contrast of the tokens.
//   node scripts/a11y-check.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startPreview } from './serve.mjs';
import { fixture } from '../test/helpers.mjs';

// WCAG 2.2 relative luminance contrast.
function luminance(hex) {
  const [r, g, b] = hex.match(/\w\w/g).map((pair) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};
const tokens = {
  text: '#d1d5db', strong: '#f3f4f6', muted: '#9ca3af', gold: '#ffa766', native: '#86efac', danger: '#fca5a5', edge: '#808897',
};
const surfaces = { dark: '#34393f', darker: '#191a1d', darkest: '#121416' };
const report = { contrast: {}, tabOrder: [], smallTargets: [], checks: [] };
for (const [name, color] of Object.entries(tokens)) {
  report.contrast[name] = Object.fromEntries(Object.entries(surfaces).map(([surface, bg]) => [surface, contrast(color, bg)]));
}

const { server, url } = await startPreview({ fromSource: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const check = (name, ok, detail = '') => {
  report.checks.push({ name, ok: Boolean(ok), detail });
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await emulateMac(context);
  await context.route((target) => target.origin !== url, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#run-date').filter({ hasText: /casks/ }).waitFor({ state: 'attached' });

  const describe = () => page.evaluate(() => {
    const el = document.activeElement;
    const name = el.getAttribute('aria-label') || el.innerText?.trim().split('\n')[0] || el.id;
    return `${el.tagName.toLowerCase()}: ${name}`;
  });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    report.tabOrder.push(await describe());
  }
  check('tab order starts with skip link then site nav then Select Apps',
    report.tabOrder[0].includes('Skip') && report.tabOrder[4] === 'button: Select Apps', report.tabOrder.slice(0, 5).join(' → '));

  // Focus ring is visible on the focused control.
  await page.locator('#choose-files').focus();
  const ring = await page.locator('#choose-files').evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
  check('Select Apps shows a focus outline when focused by keyboard', ring.startsWith('solid'), ring);

  // Disclosures open with Enter and Space.
  const advanced = page.locator('#advanced > summary');
  await advanced.focus();
  await page.keyboard.press('Enter');
  check('Enter opens Advanced', await page.locator('#advanced').evaluate((d) => d.open));
  await page.keyboard.press(' ');
  check('Space closes Advanced', !(await page.locator('#advanced').evaluate((d) => d.open)));

  // Every visible control has an accessible name and a 24×24 px target or more.
  const controls = await page.evaluate(() => [...document.querySelectorAll('button, a, summary, input:not([type=file])')]
    .filter((el) => el.checkVisibility())
    .map((el) => {
      const box = el.getBoundingClientRect();
      const label = el.labels?.[0]?.innerText;
      return { name: el.getAttribute('aria-label') || el.innerText.trim() || label || '', w: box.width, h: box.height, tag: el.tagName };
    }));
  check('all visible controls are named', controls.every((c) => c.name), controls.filter((c) => !c.name).map((c) => c.tag).join(','));
  report.smallTargets = controls.filter((c) => c.w < 24 || c.h < 24);
  check('all visible targets are at least 24×24 px', !report.smallTargets.length, JSON.stringify(report.smallTargets));

  // Scan a file, then check the row disclosure and the dialog.
  await page.locator('#files').setInputFiles(fixture('fat.macho'));
  await page.waitForFunction(() => document.getElementById('results-count').textContent === '1 of 1 finished');
  await page.waitForTimeout(300);
  const announce = await page.locator('#batch-notice').textContent();
  check('one polite batch announcement on completion', /^Finished 1 of 1\. .*scanned in .* at .*, reading only/.test(announce), announce);
  check('status regions are polite', await page.evaluate(() => ['batch-notice', 'timer-notice'].every((id) => document.getElementById(id).getAttribute('role') === 'status')));
  check('results count itself is not a live region (no per-tick chatter)', !(await page.locator('#results-count').getAttribute('role')));

  const row = page.locator('.result').first();
  await row.locator('.result-details > summary').focus();
  await page.keyboard.press('Enter');
  const trigger = row.getByRole('button', { name: 'View full scan details for fat.macho' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Scan details for fat.macho' });
  await dialog.waitFor();
  check('dialog is labelled by its title', true);
  check('focus moves into the dialog', await page.evaluate(() => document.getElementById('scan-dialog').contains(document.activeElement)));
  let trapped = true;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => document.getElementById('scan-dialog').contains(document.activeElement) || document.activeElement === document.body);
    trapped &&= inside;
  }
  check('Tab stays inside the modal dialog', trapped);
  check('page behind the dialog is inert', await page.evaluate(() => !document.getElementById('choose-files').checkVisibility() || document.querySelector('dialog:modal') !== null));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  check('Escape closes and focus returns to the trigger', await trigger.evaluate((el) => el === document.activeElement));

  const motion = await row.evaluate((el) => getComputedStyle(el).animationName);
  check('reduced motion removes row shimmer', motion === 'none', motion);

  await page.getByRole('button', { name: 'Clear results' }).click();
  check('Clear results empties the list and returns focus to Select Apps',
    await page.evaluate(() => document.getElementById('results').hidden && document.activeElement.id === 'choose-files'));
  await page.locator('#files').setInputFiles(fixture('thin.macho'));
  await page.waitForFunction(() => document.getElementById('results-count').textContent === '1 of 1 finished');

  // Phone width: no horizontal scrolling, including with Advanced and a result row open.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#advanced > summary').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('390 px layout has no horizontal overflow', overflow <= 0, `${overflow}px`);
  await page.setViewportSize({ width: 320, height: 700 });
  const narrow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('320 px layout has no horizontal overflow', narrow <= 0, `${narrow}px`);
  report.aria = await page.locator('main').ariaSnapshot();
  await context.close();
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}

console.log(JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok);
for (const c of report.checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
assert.equal(failed.length, 0, `${failed.length} accessibility checks failed`);

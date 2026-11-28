// The scanner as an embeddable fragment: everything between the scanner markers in index.html.
// The standalone page wraps it in a small shell; doesitarm.com mounts it inside its own layout.
export function scannerFragment(indexHtml) {
  const start = indexHtml.indexOf('<!--scanner:start-->');
  const end = indexHtml.indexOf('<!--scanner:end-->');
  if (start < 0 || end < start) throw new Error('index.html is missing its scanner markers');
  return indexHtml.slice(start + '<!--scanner:start-->'.length, end).trim() + '\n';
}

// Mirrors what workers/frontend/index.js does with the live site page, for local checks.
export function composeLayout(siteHtml, fragment, { scannerBase, site = 'https://doesitarm.com' }) {
  const open = siteHtml.indexOf('<div class="app-main');
  const footer = siteHtml.indexOf('<footer', open);
  if (open < 0 || footer < 0) throw new Error('The site page has no app-main region');
  const tagEnd = siteHtml.indexOf('>', open) + 1;
  const close = siteHtml.lastIndexOf('</div>', footer);
  const mounted = fragment.replace('<div class="dia-scanner"', '<div class="dia-scanner" data-embedded')
    .replace('<!--scanner-switch-->', '<p class="scanner-switch"><span>Scanner v3 (preview)</span> · <a href="?v=1">Switch to v1</a></p>');
  let page = siteHtml.slice(0, tagEnd) + mounted + siteHtml.slice(close);
  page = page.replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/(href|src)="\/(?!\/)/g, `$1="${site}/`)
    .replace('</head>', `<link rel="stylesheet" href="${scannerBase}style.css"><link rel="stylesheet" href="${scannerBase}bigfolder.css">` +
      `<script type="module" src="${scannerBase}app.js"></script></head>`);
  return page;
}

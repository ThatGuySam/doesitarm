// Runs inside the page (serialised by Playwright), so it must stay self-contained.
//
// It looks at every visible element under the scanner root and reports spacing bugs:
//   padding-tight   a container (border, own background, shadow or outline) holds content closer
//                   to an edge than its minimum
//   edge-touch      content touches the container edge (gap under 1 px)
//   overflow        content spills past the container's inner edge
//   sibling-align   stacked bordered blocks, progress tracks or bars do not share left and right edges
//   sibling-gap     stacked blocks sit closer than the minimum gutter
//   label-control   a label's text touches or overlaps its control, or controls in a row touch
//   over-padding    a container's padding is more than 2x the median of its group (computed afterwards)
//   page-overflow   the document scrolls sideways
export function measureSpacing(config) {
  const { rootSelector, limits } = config;
  const root = document.querySelector(rootSelector) ?? document.body;
  const PILLS = 'code, .beta-pill, [data-pill]';
  const CONTROLS = 'button, input, select, textarea';
  const out = [];
  const stats = [];

  const alpha = (color) => {
    if (color === 'transparent') return 0;
    const match = /rgba?\(([^)]+)\)/.exec(color);
    if (!match) return 1;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };
  const px = (value) => Number.parseFloat(value) || 0;
  const INERT = new Set(['template', 'script', 'style', 'noscript', 'link', 'meta']);
  const visible = (el) => {
    if (INERT.has(el.localName)) return false;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 && box.height <= 1) return false;
    return !(box.width === 0 || box.height === 0);
  };
  const describe = (el) => {
    const parts = [];
    for (let node = el, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth++) {
      const classes = [...node.classList].slice(0, 2).map((name) => `.${name}`).join('');
      parts.unshift(`${node.localName}${node.id ? `#${node.id}` : ''}${classes}`);
    }
    return parts.join(' > ');
  };
  const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  const report = (rule, el, detail) => out.push({ rule, selector: describe(el), text: label(el), ...detail });

  const border = (style, side) => px(style[`border${side}Width`]) >= 1 && style[`border${side}Style`] !== 'none'
    && alpha(style[`border${side}Color`]) > 0;
  const paint = (style) => `${alpha(style.backgroundColor) > 0 ? style.backgroundColor : ''}|${style.backgroundImage === 'none' ? '' : style.backgroundImage}`;
  const isControl = (el) => el.matches(CONTROLS) && !(el.localName === 'input' && ['hidden', 'checkbox', 'radio'].includes(el.type));
  const outerShadow = (style) => style.boxShadow !== 'none' && style.boxShadow.split(/,(?![^(]*\))/).some((part) => !/\binset\b/.test(part));
  const containerKind = (el) => {
    if (el === root || el === document.body || el === document.documentElement) return null;
    if (['progress', 'svg', 'tr', 'tbody', 'thead', 'table', 'option', 'optgroup'].includes(el.localName)) return null;
    if (el.closest('svg')) return null;
    const style = getComputedStyle(el);
    const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
    const edged = ['Top', 'Right', 'Bottom', 'Left'].some((side) => border(style, side));
    const filled = paint(style) !== '|' && (!parentStyle || paint(style) !== paint(parentStyle));
    const shadowed = outerShadow(style);
    const outlined = style.outlineStyle !== 'none' && px(style.outlineWidth) > 0 && el !== document.activeElement;
    if (!(edged || filled || shadowed || outlined)) return null;
    // A rule on one side only (table row dividers, list separators) is a divider, not a container.
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((side) => border(style, side)).length;
    if (sides === 1 && !filled && !shadowed && !outlined && !['td', 'th'].includes(el.localName)) return null;
    if (el.matches(PILLS)) return 'pill';
    if (isControl(el) || el.localName === 'summary') return 'control';
    if (el.localName === 'dialog') return 'dialog';
    if (el.localName === 'td' || el.localName === 'th') return 'cell';
    return 'panel';
  };

  const textRects = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  };
  const contentBoxes = (container) => {
    const boxes = [];
    const walk = (parent) => {
      for (const node of parent.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent.trim()) boxes.push(...textRects(node).map((rect) => ({ rect, text: true })));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (!visible(node) && getComputedStyle(node).display !== 'contents') continue;
          const style = getComputedStyle(node);
          if (style.position === 'absolute' || style.position === 'fixed') continue;
          if (['progress', 'svg'].includes(node.localName) || node.matches('::marker')) continue;
          if (style.display === 'contents') { walk(node); continue; }
          if (isControl(node) || containerKind(node) || ['img', 'canvas', 'video'].includes(node.localName)) {
            boxes.push({ rect: node.getBoundingClientRect(), text: false });
          } else {
            walk(node);
          }
        }
      }
    };
    walk(container);
    return boxes;
  };

  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    if (!visible(el)) continue;
    const kind = containerKind(el);
    if (!kind) continue;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const inner = {
      left: box.left + px(style.borderLeftWidth), right: box.right - px(style.borderRightWidth),
      top: box.top + px(style.borderTopWidth), bottom: box.bottom - px(style.borderBottomWidth),
    };
    const pad = { left: px(style.paddingLeft), right: px(style.paddingRight), top: px(style.paddingTop), bottom: px(style.paddingBottom) };
    const classes = [...el.classList].filter((name) => !/^(is-|dragging)/.test(name)).sort().join('.');
    const group = `${kind}:${el.localName}${el.id && kind === 'dialog' ? `#${el.id}` : ''}.${classes}`;
    if (kind !== 'pill') stats.push({ selector: describe(el), kind, group, ...pad });

    const limit = limits[kind];
    // Scroll containers (tables, JSON blocks, the dialog) clip or scroll their content on purpose; their
    // cells and children carry their own padding.
    const scrolls = ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY);
    if (scrolls) continue;
    // Rows with content-visibility: auto are not laid out off screen, so their text boxes are placeholders.
    const lazy = [...el.children].some((child) => getComputedStyle(child).contentVisibility === 'auto');
    if (el.matches('input, select, textarea')) {
      // Native controls draw their own text; their computed padding is the measure.
      for (const [side, value] of Object.entries(pad)) {
        const min = side === 'left' || side === 'right' ? limit.inline : limit.block;
        if (value + (side === 'left' || side === 'right' ? 0 : 0) < min) {
          report('padding-tight', el, { side, gap: value, min, kind });
        }
      }
      continue;
    }
    const boxes = contentBoxes(el);
    if (!boxes.length) continue;
    const edges = {
      left: Math.min(...boxes.map(({ rect }) => rect.left)) - inner.left,
      right: inner.right - Math.max(...boxes.map(({ rect }) => rect.right)),
      top: Math.min(...boxes.map(({ rect }) => rect.top)) - inner.top,
      bottom: inner.bottom - Math.max(...boxes.map(({ rect }) => rect.bottom)),
    };
    for (const [side, gap] of Object.entries(edges)) {
      const horizontal = side === 'left' || side === 'right';
      const min = horizontal ? limit.inline : limit.block;
      const rounded = Math.round(gap * 10) / 10;
      if (lazy && !horizontal) continue;
      if (gap < -1) report('overflow', el, { side, gap: rounded, kind });
      else if (gap < 1 && kind !== 'cell') report('edge-touch', el, { side, gap: rounded, min, kind });
      else if (gap < min - 0.5) report('padding-tight', el, { side, gap: rounded, min, kind });
    }
  }

  // Stacked visual blocks (bordered blocks, progress tracks, outcome bars) must share edges and keep a gutter.
  const visualBlock = (el) => visible(el) && !['absolute', 'fixed'].includes(getComputedStyle(el).position) && el.localName !== 'dialog' && (['progress'].includes(el.localName) || el.matches('svg[role="img"]') || containerKind(el) === 'panel' || containerKind(el) === 'dialog');
  for (const parent of [root, ...root.querySelectorAll('*')]) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || (style.display.includes('flex') && !style.flexDirection.startsWith('column'))) continue;
    // Grid parents are skipped: reading gridTemplateColumns crashes the renderer on some grids in Chromium 155.
    if (style.display.includes('grid')) continue;
    const blocks = [...parent.children].filter(visualBlock)
      .map((el) => ({ el, rect: el.getBoundingClientRect() })).sort((a, b) => a.rect.top - b.rect.top);
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1];
      const next = blocks[i];
      if (next.rect.top < prev.rect.bottom - 1) continue; // side by side, not stacked
      const dLeft = Math.abs(prev.rect.left - next.rect.left);
      const dRight = Math.abs(prev.rect.right - next.rect.right);
      if (dLeft > 1 || dRight > 1) {
        report('sibling-align', next.el, { with: describe(prev.el), left: Math.round(dLeft * 10) / 10, right: Math.round(dRight * 10) / 10 });
      }
      const gap = next.rect.top - prev.rect.bottom;
      if (gap < limits.gutter - 0.5) report('sibling-gap', next.el, { with: describe(prev.el), gap: Math.round(gap * 10) / 10, min: limits.gutter });
    }
  }

  // Labels and their controls, and controls laid out in a row.
  const distance = (a, b) => {
    const dx = Math.max(a.left - b.right, b.left - a.right, 0);
    const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
    const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return overlap ? -1 : Math.hypot(dx, dy);
  };
  for (const text of root.querySelectorAll('label')) {
    if (!visible(text)) continue;
    const controls = [...text.querySelectorAll(CONTROLS)];
    if (text.control && !controls.includes(text.control)) controls.push(text.control);
    const words = [];
    const gather = (parent) => {
      for (const node of parent.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) words.push(...textRects(node));
        else if (node.nodeType === Node.ELEMENT_NODE && !node.matches(CONTROLS) && visible(node)) gather(node);
      }
    };
    gather(text);
    for (const control of controls) {
      if (!visible(control) || control.localName === 'input' && ['checkbox', 'radio'].includes(control.type)) continue;
      const box = control.getBoundingClientRect();
      const nearest = Math.min(...words.map((word) => distance(word, box)));
      if (words.length && nearest < limits.labelGap) {
        report('label-control', control, { label: label(text), gap: Math.round(nearest * 10) / 10, min: limits.labelGap });
      }
    }
  }
  for (const parent of root.querySelectorAll('*')) {
    const style = getComputedStyle(parent);
    if (!style.display.includes('flex') || !visible(parent)) continue;
    const items = [...parent.children].filter((child) => visible(child) && getComputedStyle(child).position !== 'absolute');
    for (let i = 1; i < items.length; i++) {
      const [a, b] = [items[i - 1], items[i]];
      if (!(a.matches(CONTROLS) || b.matches(CONTROLS) || containerKind(a) || containerKind(b))) continue;
      const gap = distance(a.getBoundingClientRect(), b.getBoundingClientRect());
      if (gap >= 0 && gap < limits.labelGap) report('label-control', b, { with: describe(a), gap: Math.round(gap * 10) / 10, min: limits.labelGap });
    }
  }

  const sideways = document.documentElement.scrollWidth - innerWidth;
  if (sideways > 1) out.push({ rule: 'page-overflow', selector: 'html', text: '', gap: sideways });
  return { violations: out, stats };
}

export const LIMITS = {
  // px. Block containers: 8 px on every side that holds content.
  panel: { inline: 8, block: 8 },
  dialog: { inline: 8, block: 8 },
  // Buttons and summaries: 8 px inline; their 44 px target gives the block axis.
  control: { inline: 8, block: 4 },
  // Table cells: the existing dense cell padding.
  cell: { inline: 8, block: 4 },
  // Pills and badges (code chips, the Beta badge): small by design.
  pill: { inline: 4, block: 0 },
  gutter: 8,
  labelGap: 4,
};

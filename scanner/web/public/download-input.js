import { redactPath } from './path-privacy.js';

const get = (id) => document.getElementById(id);
const PREFERENCE = 'scanner-entry';
const DIRECT = /\.(?:dmg|pkg|zip|tar\.gz|tgz|macho|exe|dll|msi|msix|appx|msixbundle|appxbundle|7z|cab)$/i;
const ARCHITECTURE = { arm64: 'Apple Silicon (arm64)', universal: 'Universal', x86_64: 'Intel (x86_64)', unknown: 'CPU unspecified' };
const OS = { macos: 'macOS', windows: 'Windows', other: 'Other OS', unknown: 'OS unspecified' };
const MESSAGES = {
  app_store: 'This app is distributed through the Mac App Store. Open its listing to install it on a Mac.',
  vendor_action: 'The publisher requires a step before the download. Open its page to sign in, accept the terms or complete the download, then scan the file from your device.',
  access_restricted: 'The publisher limited access to this page. Open the page in your browser and use its download instructions.',
  artifact_too_large: 'The download is too large for an anonymous page scan. Download it from the publisher and scan the file from this device.',
  document_limit: 'The page exceeded the scanner’s limits. Paste the publisher’s direct download link or scan the file from this device.',
  host_rate_limit: 'The download host has asked the scanner to wait. Try again in a minute.',
  timeout: 'Reading the page took too long. Try again or paste the direct download link.',
};

export function deviceProfile(navigator, coarsePointer = false) {
  const ua = navigator.userAgent ?? '';
  const platform = navigator.platform ?? '';
  const hint = navigator.userAgentData?.platform ?? '';
  const mobile = /Android|iPad|iPhone|iPod/i.test(ua);
  const touch = Number(navigator.maxTouchPoints) > 0 || coarsePointer || mobile;
  const reportedMac = /^(?:macOS|Mac(?:Intel|PPC|68K)?)$/i;
  const disguisedIPad = touch && (/Macintosh/i.test(ua) || reportedMac.test(platform));
  const mac = !mobile && !disguisedIPad && (
    hint ? reportedMac.test(hint) : platform ? reportedMac.test(platform) : /Macintosh|Mac OS X/i.test(ua)
  );
  return { mac, touch };
}

export function defaultEntry(device, stored) {
  return stored === 'files' || stored === 'url' ? stored : device.mac ? 'files' : 'url';
}

export function configureScannerEntry() {
  const zone = get('drop-zone');
  const deviceFiles = get('device-files');
  const urlDetails = get('advanced');
  const { mac, touch } = deviceProfile(navigator, matchMedia('(pointer: coarse)').matches);
  let stored;
  try { stored = localStorage.getItem(PREFERENCE); } catch { /* Storage is optional. */ }
  const entry = defaultEntry({ mac }, stored);
  zone.dataset.entry = entry;
  // Feature detection, not user-agent sniffing: Firefox and Safari take folders by drag and drop.
  get('choose-folder').hidden = typeof window.showDirectoryPicker !== 'function';
  document.body.classList.toggle('touch-input', touch);
  if (entry === 'url') {
    zone.prepend(urlDetails);
    urlDetails.open = true;
    deviceFiles.open = false;
    get('scan-help').append(get('scan-settings'));
  } else {
    get('scan-options').prepend(get('choose-folder'));
  }
  function remember(mode) {
    try { localStorage.setItem(PREFERENCE, mode); } catch { /* Keep the current page usable. */ }
  }
  deviceFiles.querySelector('summary').addEventListener('click', () => { if (!deviceFiles.open) remember('files'); });
  urlDetails.querySelector('summary').addEventListener('click', () => remember(urlDetails.open ? 'files' : 'url'));
  for (const id of ['choose-files', 'choose-folder']) get(id).addEventListener('click', () => remember('files'));
  return { remember };
}

export function publicDownload(value) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 4096 ||
      !/^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(value.trim()) || /[\\\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Expected a public HTTPS URL.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') ||
      url.hostname.startsWith('[') || /^(?:\d+\.){3}\d+$/.test(url.hostname) ||
      /\.(?:local|localhost|internal|lan|test|invalid|example|onion|alt|arpa|corp|home|localdomain|intranet)\.?$/i.test(url.hostname)) {
    throw new TypeError('Expected a public HTTPS URL.');
  }
  url.hash = '';
  return url;
}

function publicLink(url, text) {
  const link = document.createElement('a');
  link.href = url.href;
  link.textContent = text;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function labelOf(candidate) {
  return `${candidate.filename} · ${OS[candidate.os] ?? OS.unknown} · ${ARCHITECTURE[candidate.arch] ?? ARCHITECTURE.unknown} · ${candidate.url.hostname}`;
}

function normalizeCandidate(item) {
  const url = publicDownload(item.url);
  return { ...item, url, filename: String(item.filename || url.pathname.split('/').at(-1) || url.hostname).slice(0, 160) };
}

function sources(candidates) {
  const details = document.createElement('details');
  details.className = 'download-sources';
  const summary = document.createElement('summary');
  summary.textContent = 'Download sources';
  const list = document.createElement('ul');
  for (const candidate of candidates) {
    const item = document.createElement('li');
    const evidence = document.createElement('p');
    const { page, path, selector, text } = candidate.evidence ?? {};
    const location = page && `${page}${path && path !== '/' ? path : ''}`;
    const where = [location, selector, text].filter(Boolean).join(' · ');
    evidence.textContent = where ? `Found at ${where}` : 'Pasted URL';
    item.append(publicLink(candidate.url, labelOf(candidate)), evidence);
    if (candidate.kind === 'installer_stub') {
      evidence.append(' This file is a setup program. Its result describes the setup program.');
    }
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function candidatePicker(candidates, pick) {
  const form = document.createElement('form');
  form.className = 'candidate-picker';
  const label = document.createElement('label');
  label.textContent = 'Choose a macOS download';
  const select = document.createElement('select');
  select.required = true;
  select.add(new Option('Select a download', ''));
  candidates.forEach((candidate, index) => select.add(new Option(labelOf(candidate), String(index))));
  label.append(select);
  const button = document.createElement('button');
  button.className = 'quiet-button';
  button.textContent = 'Scan selected download';
  form.append(label, button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (select.value !== '') {
      pick(candidates[Number(select.value)]);
      get('url-phase').focus();
      form.remove();
    }
  });
  return { form, select };
}

export function bindDownloadInput({ view, remember }) {
  const form = get('url-form');
  const input = get('scan-url');
  const error = get('url-error');
  const phase = get('url-phase');
  const options = get('download-options');
  let lookup;
  let generation = 0;

  function status(text, loading = false) {
    phase.textContent = text;
    phase.classList.toggle('is-loading', loading);
  }

  function scan(candidate, id, discovered) {
    const resolvedDownload = discovered && candidate.os !== 'windows';
    const arch = candidate.arch && candidate.arch !== 'unknown' ? ` (${candidate.arch})` : '';
    status(resolvedDownload ? `Scanning macOS download${arch}…` : 'Scanning download…', true);
    view.add([{
      kind: 'url', url: candidate.url.href, label: redactPath(candidate.filename),
      forceWorker: resolvedDownload, resolvedDownload,
      onSettled: (event) => {
        if (id === generation) status(event.type === 'canceled' ? 'Scan canceled.' : 'Scan finished. See results below.');
      },
    }]);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = ++generation;
    lookup?.abort();
    const controller = new AbortController();
    lookup = controller;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    options.replaceChildren();
    status('');
    let target;
    try {
      target = publicDownload(input.value);
    } catch {
      error.textContent = 'Enter a public HTTPS download link or download page.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    remember('url');
    if (redactPath(input.value) !== input.value) input.value = '';
    if (DIRECT.test(target.pathname)) {
      scan({ url: target, filename: target.pathname.split('/').at(-1) }, id, false);
      return;
    }

    status('Reading the page…', true);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST', headers: { 'X-Scan-Client': 'browser', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target.href }), credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error();
      const result = await response.json();
      if (id !== generation) return;
      const candidates = ['resolved', 'ambiguous'].includes(result.decision)
        ? result.candidates.slice(0, 3).map(normalizeCandidate) : [];
      if (candidates.length) {
        status(`Found ${candidates.length} possible download${candidates.length === 1 ? '' : 's'}`);
        options.append(sources(candidates));
        if (result.decision === 'ambiguous' && candidates.length > 1) {
          const picker = candidatePicker(candidates, (candidate) => scan(candidate, id, true));
          options.prepend(picker.form);
          picker.select.focus();
        } else {
          // Give the discovery update a paint before announcing the scan.
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 120);
            requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
          });
          if (id === generation) scan(candidates[0], id, true);
        }
      } else {
        const message = MESSAGES[result.reason] ?? 'No public macOS file could be verified. Try the publisher’s direct download link.';
        status(message);
        if (result.reason === 'app_store' && result.handoff) {
          const store = publicDownload(result.handoff.url);
          if (['apps.apple.com', 'itunes.apple.com'].includes(store.hostname)) options.append(publicLink(store, 'Open Mac App Store listing'));
        } else if (result.decision === 'gated') {
          options.append(publicLink(target, 'Open publisher’s download page'));
        }
      }
    } catch {
      if (id === generation && !controller.signal.aborted) status('The scanner could not read this page. Try again or paste the direct download link.');
    }
  });
}

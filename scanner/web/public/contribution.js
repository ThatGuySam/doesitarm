import { redactPath } from './path-privacy.js';
import { ARCHITECTURE_NAMES, buildScanSubmission, INFO_PLIST_ALLOWED_KEYS } from './scan-allowlist.js';

export const STORE_URL = 'https://doesitarm-functions-scc.vercel.app/api/test-results-store';
export const CATALOG_URL = 'https://api.doesitarm.com/app-list.json';
const UNAVAILABLE = Object.freeze({ unavailable: true });

function bundleName(path) {
  if (typeof path !== 'string') return null;
  const name = path.split(/[\\/]/).pop();
  return /\.app$/i.test(name) ? name : null;
}

export function contributionPayload(row) {
  const result = row.result;
  if (result?.status !== 'complete' || result.windows || result.wrapper_path || row.parentBundlePath) return null;

  const names = (result.architectures ?? []).filter((slice) => slice.header_verified && ARCHITECTURE_NAMES.includes(slice.name))
    .map((slice) => slice.name);
  if (!names.length) return null;

  const reported = {
    CFBundleIdentifier: result.bundle_id,
    CFBundleName: result.name,
    CFBundleShortVersionString: result.version,
    LSMinimumSystemVersion: result.min_macos,
  };
  const source = row.evidence?.info_plist;
  const infoPlist = {};
  for (const key of INFO_PLIST_ALLOWED_KEYS) {
    const value = source && Object.hasOwn(source, key) ? source[key] : reported[key];
    if (redactPath(value) === value) infoPlist[key] = value;
  }
  const { CFBundleIdentifier: id, CFBundlePackageType: type } = infoPlist;
  if (typeof id !== 'string' || !id.trim() || (type != null && type !== 'APPL')) return null;

  return buildScanSubmission({
    filename: bundleName(result.bundle_path) ?? (row.kind === 'bundle' ? bundleName(row.label) : null),
    appVersion: infoPlist.CFBundleShortVersionString ?? infoPlist.CFBundleVersion,
    result: names.includes('arm64') || names.includes('arm64e') ? '✅' : '🔶',
    machoMeta: names,
    infoPlist,
  });
}

export function supportedVersion(response) {
  const value = response?.supportedVersionNumber;
  if (typeof value !== 'string' && !Number.isFinite(value)) return null;
  const text = String(value).trim().replace(/^v(?=\d)/i, '');
  return /^[0-9A-Za-z][0-9A-Za-z ._()+-]{0,255}$/.test(text) && /\d/.test(text) && text !== '0' ? text : null;
}

function catalogLink(catalog, { CFBundleIdentifier, CFBundleName, CFBundleDisplayName }) {
  const matches = catalog.filter((app) => app.bundleIds?.includes(CFBundleIdentifier));
  if (!matches.length) {
    const names = [CFBundleName, CFBundleDisplayName].filter(Boolean);
    matches.push(...catalog.filter((app) => !app.bundleIds?.length &&
      [app.name, ...(app.aliases ?? [])].some((name) => names.includes(name))));
  }
  if (matches.length !== 1) return null;
  const app = matches[0];
  if (/^\/app\/[a-z0-9][a-z0-9-]*\/?$/.test(app.endpoint)) {
    return { href: new URL(app.endpoint, 'https://doesitarm.com').href, label: 'View on Does It ARM' };
  }
  for (const link of app.relatedLinks ?? []) {
    if (!/\bdownload\b/i.test(link.label) || !URL.canParse(link.href)) continue;
    const url = new URL(link.href);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      return { href: url.href, label: 'Download' };
    }
  }
  return null;
}

export function createUpgradeCheck({ fetch: send = globalThis.fetch.bind(globalThis), online = () => navigator.onLine } = {}) {
  let queue = Promise.resolve();
  let catalog;
  const requestOptions = { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' };

  return function check(row, consent) {
    if (!consent || consent.aborted) return;
    const payload = contributionPayload(row);
    if (!payload) return;
    if (!online()) return Promise.resolve(UNAVAILABLE);

    // A folder can finish many local scans before the store answers the first one.
    const request = queue.then(async () => {
      consent.throwIfAborted();
      if (!online()) return UNAVAILABLE;
      const response = await send(STORE_URL, {
        ...requestOptions,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([consent, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) return UNAVAILABLE;
      const data = await response.json();
      if (data?.status !== 'Done') return UNAVAILABLE;

      let link = null;
      try {
        consent.throwIfAborted();
        if (!catalog) {
          const response = await send(CATALOG_URL, {
            ...requestOptions,
            signal: AbortSignal.any([consent, AbortSignal.timeout(5_000)]),
          });
          if (response.ok) {
            const apps = await response.json();
            if (Array.isArray(apps)) catalog = apps;
          }
        }
        if (catalog) link = catalogLink(catalog, JSON.parse(payload.infoPlist));
      } catch {
        // The store's version is still usable if the catalog is unreachable.
      }
      if (!consent.aborted) return { version: supportedVersion(data), link };
    }).catch(() => consent.aborted ? undefined : UNAVAILABLE);
    queue = request;
    return request;
  };
}

const ARCH = {
  arm64: 'ARM64',
  arm64ec: 'ARM64EC',
  arm64x: 'ARM64X',
  arm32: '32-bit Arm',
  x64: 'x64',
  x86: 'x86',
  ia64: 'Itanium',
  anycpu: 'AnyCPU',
  neutral: 'Neutral',
};

export function windowsArchitectures(windows) {
  return windows.architectures.map((arch) => ARCH[arch] ?? arch);
}

export function windowsVerdict(windows) {
  const { architecture_source: source, main_architecture: main, payload_status: payload } = windows;
  const result = (tone, icon, detail) => ({ tone, icon, text: `Windows app · ${detail}` });
  if (!windows.architectures.length) {
    return result('unknown', '?', payload ?? 'architecture unknown');
  }
  if (source === 'msi_template') {
    const arch = windowsArchitectures(windows).join(', ');
    return result('unknown', '?', `${arch} MSI package · app payload unknown`);
  }
  if (source === 'pe_machine' || source === 'archive_pe_machine') {
    return result('unknown', '?', 'PE machine fields read · full architecture unverified');
  }
  if (!main && source === 'archive_pe_headers') {
    return result('unknown', '?', 'main app architecture unknown');
  }
  if (main === 'arm64x' || !main && windows.arm64x) {
    return result('native', '✓', 'ARM64X (ARM64 and ARM64EC)');
  }
  if (main === 'arm64ec' || !main && windows.arm64ec) {
    return result('native', '✓', 'ARM64EC (works with emulated x64 code)');
  }
  if (main === 'arm64' || !main && windows.native_arm64) {
    return result('native', '✓', 'native ARM64');
  }
  if (main === 'anycpu') {
    return result('unknown', '?', windows.dotnet?.prefers_32bit
      ? '.NET AnyCPU (prefers 32-bit)' : '.NET AnyCPU (depends on the installed runtime)');
  }
  if ((main === 'x86' || main === 'x64' || !main && windows.emulated_only) &&
      windows.subsystem !== 1 && !payload) {
    return result('intel', '◆', `${ARCH[main] ?? 'x86/x64'} only · requires Prism emulation on Windows 11 on Arm`);
  }
  return result('unknown', '?', `${ARCH[main] ?? 'package'} · Arm compatibility unverified`);
}

// The search export has no publisher column. These explicit aliases are
// limited to publisher/product pairs checked against the publisher and listing.
const IDENTITIES = new Map([
  ['/app/figma', {
    names: ['figma', 'figma desktop'],
    publishers: ['figma, inc.', 'figma inc.'],
  }],
  ['/app/slack', {
    names: ['slack', 'slack desktop'],
    publishers: ['slack technologies inc.', 'slack technologies, inc.', 'slack technologies, llc'],
  }],
  ['/app/zoom', {
    names: ['zoom', 'zoom workplace', 'zoom workplace (arm64)', 'zoom workplace (64-bit)'],
    publishers: ['zoom', 'zoom communications, inc.', 'zoom video communications, inc.'],
  }],
  ['/app/spotify', {
    names: ['spotify', 'spotify installer', 'spotify setup', 'install spotify'],
    publishers: ['spotify ab', 'spotify ltd', 'spotify'],
  }],
  ['/app/notion-desktop', {
    names: ['notion', 'notion desktop'],
    publishers: ['notion labs, inc.', 'notion labs inc.', 'notion labs, inc', 'notion labs'],
  }],
  ['/app/vs-code', {
    names: ['visual studio code', 'microsoft visual studio code', 'vs code'],
    publishers: ['microsoft', 'microsoft corporation'],
  }],
]);
const GENERIC = new Set(['app', 'application', 'browser', 'installer', 'setup', 'update', 'updater']);
const MAC_STATUS = { native: 'native', rosetta: 'Rosetta', unsupported: 'unsupported', unknown: 'unreported' };

function normalized(value) {
  return typeof value === 'string' ? value.replace(/[™®]/g, '').normalize('NFKC')
    .toLowerCase().trim().replace(/\s+/g, ' ') : '';
}

export function macCandidate(windows, entries) {
  const name = normalized(windows.product_name);
  const publisher = normalized(windows.publisher).replace(/^cn=([^,]+).*$/, '$1').trim();
  if (name.length < 3 || GENERIC.has(name)) return null;
  const matches = entries.filter(([displayName, path]) => {
    const identity = IDENTITIES.get(path);
    if (identity?.names.includes(name) && publisher) return identity.publishers.includes(publisher);
    return normalized(displayName) === name;
  });
  if (matches.length !== 1) return null;
  const [title, path, status] = matches[0];
  if (!/^\/app\/[a-z0-9][a-z0-9-]*$/.test(path) || !Object.hasOwn(MAC_STATUS, status)) return null;
  return { title, url: `https://doesitarm.com${path}/`, status: MAC_STATUS[status] };
}

let catalog;
export function lookupMac(windows, fetchCatalog = fetch) {
  if (!windows.product_name) return Promise.resolve(null);
  catalog ??= fetchCatalog(new URL('./mac-catalog.json', import.meta.url), { credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error('Mac catalog unavailable');
      return response.json();
    })
    .catch((error) => {
      catalog = undefined;
      throw error;
    });
  return catalog.then((entries) => macCandidate(windows, entries));
}

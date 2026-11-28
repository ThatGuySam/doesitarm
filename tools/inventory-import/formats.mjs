import { parse } from 'csv-parse/sync';
import { parsePlist } from './plist.mjs';

const trim = value => typeof value === 'string' ? value.trim() : '';
const id = value => Number.isSafeInteger(value) ? String(value) : trim(value);
const all = (headers, ...names) => names.every(name => headers.includes(name));
const has = (headers, ...names) => names.some(name => headers.includes(name));
const isMac = platform => /^(?:mac|macos|mac os|mac os x|os x|darwin|apple mac)(?:\s+.*)?$/i.test(trim(platform));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const blank = fields => fields.every(value => !trim(value));
const unwrapFleet = value => /^="(0[0-9]+)"$/.exec(value ?? '')?.[1] ?? value;

export function decode(bytes, encoding) {
  const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be'
    : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : null;
  try {
    const decoder = new TextDecoder(encoding || bom || 'utf-8', { fatal: true });
    if (bom && decoder.encoding !== bom && encoding?.toLowerCase() !== 'utf-16') throw new Error();
    const text = new TextDecoder(bom || decoder.encoding, { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch {
    throw new Error('Inventory encoding is invalid. Use UTF-8, BOM-marked UTF-16, or specify --encoding.');
  }
}

export function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Malformed JSON input.');
  }
}

function objects(value) {
  if (!Array.isArray(value) || !value.every(isObject)) throw new Error('Unexpected report shape for this profile.');
  return value;
}

function makeRecord(row, metadata = {}) {
  return {
    row,
    device: id(metadata.device),
    label: trim(metadata.label),
    architecture: trim(metadata.architecture),
    sourceCount: /^\d+$/.test(id(metadata.sourceCount)) && Number.isSafeInteger(Number(metadata.sourceCount))
      ? Number(metadata.sourceCount) : null,
    fetchedAt: /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(trim(metadata.fetchedAt))
      ? trim(metadata.fetchedAt) : null,
  };
}

function osqueryRecord(record, { device, label, fetchedAt, verifiedVersion }) {
  return makeRecord({
    name: record.name,
    bundle_id: record.bundle_identifier,
    version: record.bundle_short_version || (verifiedVersion ? record.version : undefined),
    build: record.bundle_version,
  }, { device, label, fetchedAt });
}

const csvProfiles = {
  'jamf-pro-applications': {
    matches: (h, o) => all(h, 'Version', 'Computer Name') &&
      (h.includes('Application Name') || (o.verifiedHeaders && h.includes('Application'))),
    row(get, state, o) {
      const name = trim(get('Application Name') ?? (o.verifiedHeaders ? get('Application') : undefined));
      const version = trim(get('Version'));
      const label = trim(get('Computer Name'));
      if (name) state.group = { name, version };
      if (name && !label) return state.headerOnly;
      if (label && state.group && (name || !version)) return makeRecord(state.group, { label });
      state.group = null;
    },
  },
  'iru-prism-apps': {
    matches: h => all(h, 'name', 'bundle_id', 'short_version'),
    row: (get, _, o) => makeRecord({
      name: get('name'), bundle_id: get('bundle_id'), version: get('short_version'),
      build: o.verifiedBuild ? get('version') : undefined,
    }, { device: get('device_id') || get('device__id') || get('serial_number') }),
  },
  'intune-discovered-apps': {
    matches: (h, o) => all(h, 'ApplicationName', 'ApplicationVersion') && (o.macOnly || h.includes('Platform')),
    row(get, state, o) {
      const platform = get('Platform');
      if (!isMac(platform) && (trim(platform) || !o.macOnly)) return state.filtered;
      return makeRecord({
        name: get('ApplicationName'), publisher: get('ApplicationPublisher'),
        version: (o.verifiedVersion ? get('ApplicationShortVersion') : undefined) || get('ApplicationVersion'),
      }, { device: get('DeviceId'), sourceCount: get('DeviceCount') });
    },
  },
  'fleet-csv': {
    matches: (h, o) => all(h, 'name', 'bundle_identifier') &&
      (h.includes('bundle_short_version') || (o.verifiedVersion && h.includes('version'))),
    row(get, _, o) {
      const record = Object.fromEntries(
        ['name', 'bundle_identifier', 'bundle_short_version', 'bundle_version', 'version'].map(key => [key, unwrapFleet(get(key))]),
      );
      return osqueryRecord(record, { label: get('host_display_name'), fetchedAt: get('last_fetched'), verifiedVersion: o.verifiedVersion });
    },
  },
  'jumpcloud-system-app': {
    matches: h => all(h, 'SystemID', 'SystemOS', 'SoftwareName', 'SoftwareVersion', 'SoftwareVendor'),
    row(get, state) {
      if (!isMac(get('SystemOS'))) return state.filtered;
      return makeRecord({
        name: get('SoftwareName'), version: get('SoftwareVersion'), publisher: get('SoftwareVendor'),
      }, { device: get('SystemID') });
    },
  },
  'munkireport-applications': {
    matches(h, o) {
      return h.filter(field => field === 'Name').length === 2 &&
        all(h, 'Serial Number', 'Bundle ID', 'Architecture') &&
        h.indexOf('Name') < h.indexOf('Serial Number') && h.lastIndexOf('Name') > h.indexOf('Serial Number') &&
        (h.includes('Bundle Version') || (o.verifiedVersion && h.includes('Version')));
    },
    row: (get, _, o) => makeRecord({
      name: get('Name', 1), bundle_id: get('Bundle ID'),
      version: get('Bundle Version') || (o.verifiedVersion ? get('Version') : undefined),
    }, { device: get('Serial Number'), architecture: get('Architecture') }),
  },
  'lansweeper-classic': {
    matches: (h, o) => all(h, 'AssetID', 'Software', 'Version', 'Publisher') &&
      (o.macOnly || has(h, 'AssetType', 'OS')),
    row(get, state, o) {
      const indicators = [get('AssetType'), get('OS')].filter(value => trim(value));
      if (!indicators.some(isMac) && !o.macOnly) return state.filtered;
      return makeRecord({ name: get('Software'), version: get('Version'), publisher: get('Publisher') }, { device: get('AssetID') });
    },
  },
  'mapped-csv': {
    matches: (h, o) => Object.values(o.columns).every(column => column <= h.length),
    row(get, _, o) {
      const select = field => get(o.columns[field]);
      const row = Object.fromEntries(publicFields.map(field => [field, select(field)]));
      return makeRecord(row, { device: select('device'), label: select('label'), architecture: select('architecture') });
    },
  },
};

export const publicFields = ['name', 'bundle_id', 'version', 'build', 'publisher'];

function parseCsv(text, delimiter) {
  return parse(text, { delimiter, trim: true, relax_column_count: true, info: true });
}

function csvRecords(format, input, options, unresolved) {
  const profile = csvProfiles[format];
  const preamble = /^#TYPE[^\r\n]*(?:\r\n|\n|\r)/.exec(input);
  if (preamble && format !== 'jumpcloud-system-app') throw new Error('A PowerShell preamble requires the jumpcloud-system-app profile.');
  const text = preamble ? input.slice(preamble[0].length) : input;
  const firstHeader = text.split(/\r\n|\n|\r/).find(line => line.trim()) || '';
  const delimiters = (options.delimiter ? [options.delimiter] : [',', '\t', ';']).filter(delimiter => {
    try {
      const header = parseCsv(firstHeader, delimiter)[0]?.record ?? [];
      return profile.matches(header, options);
    } catch {
      return false;
    }
  });
  if (delimiters.length !== 1) {
    throw new Error(delimiters.length > 1 ? 'Ambiguous delimiter. Specify --delimiter.' : 'Headers do not match the selected profile or delimiter.');
  }

  let records;
  try {
    records = parseCsv(text, delimiters[0]);
  } catch (error) {
    throw new Error(`Malformed delimited inventory near line ${Number.isInteger(error.lines) ? error.lines : '?'}.`);
  }

  const start = records.findIndex(entry => !blank(entry.record));
  const headers = records[start].record;
  const indexes = new Map();
  headers.forEach((name, index) => indexes.set(name, [...(indexes.get(name) ?? []), index]));
  const duplicates = [...indexes].filter(([name, positions]) => name && positions.length > 1).map(([name]) => name);
  if (format !== 'mapped-csv' && (duplicates.length > 1 || (duplicates.length === 1 &&
      (format !== 'munkireport-applications' || duplicates[0] !== 'Name')))) {
    throw new Error('Duplicate headers require an explicit column mapping.');
  }

  const state = { group: null, filtered: Symbol(), headerOnly: Symbol() };
  return records.slice(start + 1).flatMap(({ record, info }) => {
    const ref = info.lines + (preamble ? 1 : 0);
    if (blank(record)) {
      state.group = null;
      return [];
    }
    if (record.length !== headers.length) {
      state.group = null;
      unresolved.push({ row: ref, reason: 'column_count' });
      return [];
    }
    const get = (field, occurrence = 0) => record[typeof field === 'number' ? field - 1 : indexes.get(field)?.[occurrence]];
    const result = profile.row(get, state, options);
    if (!result) unresolved.push({ row: ref, reason: 'unresolved_continuation' });
    return result && result !== state.filtered && result !== state.headerOnly ? [{ ...result, ref }] : [];
  });
}

function systemProfiler(root, xml, options) {
  const entries = xml
    ? objects(root).filter(report => report._dataType === 'SPApplicationsDataType').flatMap(report => objects(report._items))
    : objects(root?.SPApplicationsDataType);
  if (xml && !root.some(report => report._dataType === 'SPApplicationsDataType')) {
    throw new Error('System Information report lacks SPApplicationsDataType.');
  }
  const records = [];
  function visit(apps, depth) {
    if (depth > 32) throw new Error('System Information app nesting exceeds 32 levels.');
    for (const app of apps) {
      // A named node with only child items is a container, not an app.
      if (trim(app._name) && (!Object.hasOwn(app, '_items') || app.path || app.version || app.arch_kind)) {
        const plist = options.appPlists?.get(app.path);
        records.push(makeRecord({
          name: app._name, version: plist?.CFBundleShortVersionString || app.version,
          bundle_id: plist?.CFBundleIdentifier, build: plist?.CFBundleVersion,
        }, { architecture: app.arch_kind }));
      }
      if (Object.hasOwn(app, '_items')) visit(objects(app._items), depth + 1);
    }
  }
  visit(entries, 1);
  return records;
}

function addigyItems(root, options) {
  if (!options.macOnly) throw new Error('Addigy requires a verified Mac scope and --mac-only.');
  return objects(Array.isArray(root) ? root : root?.items);
}

function addigyDevice(app) {
  const device = id(app.agent_id ?? app.agentid);
  return device && JSON.stringify([id(app.orgid ?? app.org_id), device]);
}

const jsonProfiles = {
  'jamf-pro-inventory': (root, o) => objects(Array.isArray(root) ? root : root?.results ?? [root]).flatMap(
    computer => objects(computer.applications).map(app => makeRecord({
      name: app.name, bundle_id: app.bundleId, version: app.cfBundleShortVersionString || (o.verifiedVersion ? app.version : undefined),
      build: app.cfBundleVersion,
    }, { device: computer.id })),
  ),
  'iru-prism-json': (root, o) => objects(Array.isArray(root) ? root : root?.results).map(app => makeRecord({
    name: app.name, bundle_id: app.bundle_id, version: app.short_version, build: o.verifiedBuild ? app.version : undefined,
  }, { device: app.device_id || app.device__id || app.serial_number })),
  'intune-graph': (root, o) => objects(Array.isArray(root) ? root : root?.value).flatMap(app => {
    const platform = app.platform ?? app.Platform;
    if (!trim(platform) && !o.macOnly) throw new Error('Intune Graph rows without a platform require a verified Mac scope and --mac-only.');
    if (!isMac(platform) && trim(platform)) return [];
    return [makeRecord({
      name: app.displayName, version: app.version, publisher: app.publisher,
    }, { device: app.DeviceId ?? app.deviceId, sourceCount: app.deviceCount ?? app.DeviceCount })];
  }),
  'fleet-json': (root, o) => objects(Array.isArray(root) ? root : root?.results).map(record => {
    const app = isObject(record.columns) ? record.columns : record;
    return osqueryRecord(app, {
      device: record.host_id, label: record.host_display_name,
      fetchedAt: record.last_fetched, verifiedVersion: o.verifiedVersion,
    });
  }),
  'jumpcloud-system-insights': (root, o) => objects(Array.isArray(root) ? root : root?.results).map(app =>
    osqueryRecord(app, { device: app.system_id, verifiedVersion: o.verifiedVersion })),
  'addigy-agent': (root, o) => addigyItems(root, o).map(app =>
    makeRecord({ name: app.name, version: app.version }, { device: addigyDevice(app) })),
  'addigy-mdm': (root, o) => addigyItems(root, o).map(app => makeRecord({
    name: app.name, bundle_id: app.identifier, version: app.short_version, build: o.verifiedBuild ? app.version : undefined,
  }, { device: addigyDevice(app) })),
  'jamf-school': (root, o) => {
    if (!o.verifiedHeaders || !o.macOnly) throw new Error('Jamf School requires a verified Mac response and --verified-headers --mac-only.');
    const devices = objects(Array.isArray(root) ? root : root?.devices ?? [root?.device]);
    return devices.flatMap(device => objects(device.apps).map(app => makeRecord({
      name: app.name, bundle_id: app.identifier, publisher: app.vendor, version: app.version,
    }, { device: device.id ?? device.udid ?? device.serialNumber })));
  },
  'system-profiler-json': (root, o) => systemProfiler(root, false, o),
  'system-profiler-plist': (root, o) => systemProfiler(root, true, o),
};

export const formats = [...Object.keys(csvProfiles), ...Object.keys(jsonProfiles)];

export function parseInventory(format, text, options = {}) {
  const unresolved = [];
  if (format === 'mapped-csv') {
    const columns = options.columns;
    if (!isObject(columns) || !(columns.name || columns.bundle_id) ||
        Object.entries(columns).some(([key, column]) =>
          ![...publicFields, 'device', 'label', 'architecture'].includes(key) || !Number.isSafeInteger(column) || column < 1) ||
        new Set(Object.values(columns)).size !== Object.keys(columns).length ||
        !options.macOnly || !options.delimiter) {
      throw new Error('Mapped CSV needs distinct one-based --columns, an explicit --delimiter, and a verified --mac-only input.');
    }
  }
  if (Object.hasOwn(csvProfiles, format)) return { records: csvRecords(format, text, options, unresolved), unresolved };
  if (!Object.hasOwn(jsonProfiles, format)) throw new Error('Unknown inventory format. See --help.');
  const root = format === 'system-profiler-plist' ? parsePlist(text) : readJson(text);
  return { records: jsonProfiles[format](root, options).map((record, index) => ({ ...record, ref: index + 1 })), unresolved };
}
